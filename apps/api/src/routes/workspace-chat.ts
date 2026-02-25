import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import {
  workspaceProjects,
  workspaceFiles,
  workspaceConversations,
  workspaceMessages,
  students,
} from "@aee-pro/db/schema";
import { userSettings } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { runAgentLoop } from "../lib/agent/loop";
import { createAIProvider } from "../lib/ai";
import type { AIMessage } from "../lib/ai";
import type { Env } from "../index";

type WsEnv = Env & { Variables: { userId: string } };

export const workspaceChatRoutes = new Hono<WsEnv>();
workspaceChatRoutes.use("*", authMiddleware);

// ---------- POST /projects/:id/chat — streaming agent chat ----------

workspaceChatRoutes.post("/projects/:id/chat", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const db = createDb(c.env.DB);

  // Verify project ownership
  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  // Get user's AI settings
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiApiKeyEncrypted || !settings?.aiProvider) {
    return c.json(
      {
        success: false,
        error:
          "Configure sua chave de IA em Configurações antes de usar o Estúdio.",
      },
      400
    );
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json(
      { success: false, error: "Erro ao descriptografar chave de IA." },
      500
    );
  }

  // Parse request
  const body = await c.req.json<{
    message: string;
    conversationId?: string;
  }>();

  if (!body.message?.trim()) {
    return c.json({ success: false, error: "Mensagem é obrigatória" }, 400);
  }

  // Get or create conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    // Get latest conversation or create one
    const latest = await db
      .select()
      .from(workspaceConversations)
      .where(eq(workspaceConversations.projectId, projectId))
      .orderBy(desc(workspaceConversations.updatedAt))
      .get();

    if (latest) {
      conversationId = latest.id;
    } else {
      conversationId = crypto.randomUUID();
      await db.insert(workspaceConversations).values({
        id: conversationId,
        projectId,
        userId,
        title: body.message.slice(0, 100),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Save user message
  const userMsgId = crypto.randomUUID();
  await db.insert(workspaceMessages).values({
    id: userMsgId,
    conversationId,
    role: "user",
    content: body.message,
    createdAt: new Date().toISOString(),
  });

  // Fetch conversation history (last 40 messages for smart windowing)
  const history = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.conversationId, conversationId))
    .orderBy(workspaceMessages.createdAt)
    .limit(40);

  // Smart history windowing: if >15 messages, summarize older ones
  // and keep the last 10 in full detail for context
  const KEEP_RECENT = 10;
  let conversationSummary: string | undefined;
  let messagesToConvert = history;

  if (history.length > KEEP_RECENT) {
    const olderMessages = history.slice(0, history.length - KEEP_RECENT);
    const recentMessages = history.slice(history.length - KEEP_RECENT);

    // Build compact summary of older messages
    const summaryParts: string[] = [];
    for (const msg of olderMessages) {
      if (msg.role === "user") {
        summaryParts.push(`Professora: ${msg.content.slice(0, 150)}${msg.content.length > 150 ? "…" : ""}`);
      } else if (msg.role === "assistant") {
        const brief = msg.content.slice(0, 100);
        summaryParts.push(`Assistente: ${brief}${msg.content.length > 100 ? "…" : ""}${msg.toolCalls ? " (+ tools)" : ""}`);
      }
    }
    conversationSummary = summaryParts.join("\n");
    messagesToConvert = recentMessages;
  }

  // Build messages array for the AI.
  // Historical assistant messages with tool calls are stored as SSE events
  // (not as Claude/OpenAI content blocks), so we convert them to plain text
  // summaries. This is robust across all providers and avoids format mismatches.
  const claudeMessages = messagesToConvert
    .map((msg) => {
      if (msg.role === "tool_result") {
        // Stale DB format — skip (tool results are embedded in assistant msgs)
        return null;
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        // Convert SSE events to a text summary for history context
        const parts: string[] = [];
        if (msg.content && msg.content !== "(tool calls only)") {
          parts.push(msg.content);
        }
        try {
          const events = JSON.parse(msg.toolCalls) as Array<{
            type: string;
            tool?: string;
            toolInput?: Record<string, unknown>;
            result?: unknown;
            content?: string;
            agentTask?: string;
            agentId?: string;
          }>;

          // Collect agent IDs that have results, to detect interrupted agents
          const completedAgentIds = new Set(
            events.filter((e) => e.type === "agent_result" && e.agentId).map((e) => e.agentId!)
          );
          // Collect tools that have results
          const completedToolIds = new Set(
            events.filter((e) => e.type === "tool_result" && e.tool).map((e) => e.tool!)
          );

          for (const ev of events) {
            if (ev.type === "tool_call" && ev.tool) {
              const inputSummary = ev.toolInput
                ? Object.entries(ev.toolInput)
                    .map(([k, v]) => {
                      const val = typeof v === "string" ? v : JSON.stringify(v);
                      return `${k}: ${val.length > 100 ? val.slice(0, 100) + "…" : val}`;
                    })
                    .join(", ")
                : "";
              parts.push(`[Executei ${ev.tool}(${inputSummary})]`);
            } else if (ev.type === "tool_result" && ev.tool) {
              const resultStr =
                typeof ev.result === "string"
                  ? ev.result
                  : ev.result && typeof ev.result === "object" && "output" in (ev.result as Record<string, unknown>)
                    ? String((ev.result as Record<string, unknown>).output)
                    : JSON.stringify(ev.result);
              parts.push(
                `[Resultado ${ev.tool}: ${resultStr.length > 300 ? resultStr.slice(0, 300) + "…" : resultStr}]`
              );
            } else if (ev.type === "agent_spawn") {
              const hasResult = ev.agentId && completedAgentIds.has(ev.agentId);
              if (hasResult) {
                parts.push(`[Iniciei sub-agente: ${ev.agentTask || "tarefa"}]`);
              } else {
                // Agent was started but NEVER completed (stream interrupted)
                parts.push(`[Sub-agente INTERROMPIDO — NÃO completou: ${ev.agentTask || "tarefa"}. A tarefa precisa ser refeita.]`);
              }
            } else if (ev.type === "agent_result") {
              const res = ev.content || "";
              parts.push(
                `[Resultado sub-agente: ${res.length > 300 ? res.slice(0, 300) + "…" : res}]`
              );
            }
          }
        } catch {
          // If toolCalls JSON is invalid, just use the content text
        }
        const summary = parts.join("\n");
        if (!summary.trim()) return null;
        return {
          role: "assistant" as const,
          content: summary,
        };
      }
      return {
        role: msg.role as "user" | "assistant",
        content: msg.content,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Get project files
  const files = await db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, projectId));

  // Get student info if linked
  let studentInfo = null;
  if (project.studentId) {
    const student = await db
      .select()
      .from(students)
      .where(
        and(
          eq(students.id, project.studentId),
          eq(students.userId, userId)
        )
      )
      .get();
    if (student) {
      studentInfo = {
        name: student.name,
        diagnosis: student.diagnosis,
        grade: student.grade,
      };
    }
  }

  // Shared mutable state for collecting the assistant response
  const assistantTextParts: string[] = [];
  const toolCallsData: unknown[] = [];
  let saved = false;

  /** Persist assistant message + update timestamps */
  async function saveAssistantMessage() {
    if (saved) return;
    saved = true;
    try {
      const text = assistantTextParts.join("");
      const toolCalls = toolCallsData;
      if (text || toolCalls.length > 0) {
        await db.insert(workspaceMessages).values({
          id: crypto.randomUUID(),
          conversationId: conversationId!,
          role: "assistant",
          content: text || "(tool calls only)",
          toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
          createdAt: new Date().toISOString(),
        });
        console.log(`[workspace-chat] Saved assistant message (${text.length} chars, ${toolCalls.length} tool events)`);
      } else {
        console.log("[workspace-chat] Nothing to save (no text, no tool calls)");
      }
      const now = new Date().toISOString();
      await db
        .update(workspaceConversations)
        .set({ updatedAt: now })
        .where(eq(workspaceConversations.id, conversationId!));
      await db
        .update(workspaceProjects)
        .set({ updatedAt: now })
        .where(eq(workspaceProjects.id, projectId));
    } catch (err) {
      console.error("[workspace-chat] Failed to save assistant message:", err);
    }
  }

  // Stream response via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let streamCancelled = false;

      function safeSend(chunk: string) {
        if (streamCancelled) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          streamCancelled = true;
        }
      }

      try {
        const providerType = settings.aiProvider!;
        const agentLoop = runAgentLoop({
          apiKey,
          providerType,
          model: normalizeModel(settings.aiModel || getDefaultModel(providerType)),
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            studentId: project.studentId,
          },
          student: studentInfo,
          files,
          messages: claudeMessages,
          toolCtx: {
            db,
            r2: c.env.R2,
            userId,
            projectId,
            compilerUrl: c.env.LATEX_COMPILER_URL,
            compilerToken: c.env.LATEX_COMPILER_TOKEN,
          },
          enableThinking: providerType === "anthropic",
          conversationSummary,
          maxOutputTokens: settings.maxOutputTokens || undefined,
        });

        for await (const event of agentLoop) {
          // Collect data for saving
          if (event.type === "text" && event.content) {
            assistantTextParts.push(event.content);
          }
          if (event.type === "error" && event.content) {
            // Persist error messages so they survive page reload
            assistantTextParts.push(`\n\nErro: ${event.content}`);
          }
          if (
            event.type === "tool_call" ||
            event.type === "tool_result" ||
            event.type === "agent_spawn" ||
            event.type === "agent_result"
          ) {
            toolCallsData.push(event);
          }

          // Save to DB BEFORE sending "done" to the client, so that when the
          // frontend calls loadProject() in response to "done", the assistant
          // message is already persisted.
          if (event.type === "done") {
            await saveAssistantMessage();
          }

          const sseData = JSON.stringify(event);
          safeSend(`data: ${sseData}\n\n`);
          safeSend(": flush\n\n");
        }

        // Ensure save even if the loop ended without a "done" event
        // (e.g. AI API error yields "error" then returns without "done")
        await saveAssistantMessage();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[workspace-chat] Agent loop error:", msg);
        assistantTextParts.push(`\n\nErro: ${msg}`);
        // Save partial response before sending error to client
        await saveAssistantMessage();
        safeSend(
          `data: ${JSON.stringify({ type: "error", content: msg })}\n\n`
        );
      }

      try { controller.close(); } catch { /* stream already cancelled */ }
    },
  });

  // Keep worker alive until save completes — even if the client disconnects
  // or the stream is cancelled, the save MUST finish.
  // 120s timeout: sub-agents can take 30-90s each (parallel), plus compilation.
  c.executionCtx.waitUntil(
    new Promise<void>((resolve) => {
      const start = Date.now();
      const TIMEOUT_MS = 120_000;
      const check = () => {
        if (saved || Date.now() - start > TIMEOUT_MS) {
          if (!saved) {
            saveAssistantMessage().finally(resolve);
          } else {
            resolve();
          }
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    })
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ---------- GET /projects/:id/messages — conversation history ----------

workspaceChatRoutes.get("/projects/:id/messages", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const conversationId = c.req.query("conversationId");
  const db = createDb(c.env.DB);

  // Verify project ownership
  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  if (conversationId) {
    const messages = await db
      .select()
      .from(workspaceMessages)
      .where(eq(workspaceMessages.conversationId, conversationId))
      .orderBy(workspaceMessages.createdAt);

    return c.json({ success: true, data: messages });
  }

  // Get all conversations with latest message
  const conversations = await db
    .select()
    .from(workspaceConversations)
    .where(eq(workspaceConversations.projectId, projectId))
    .orderBy(desc(workspaceConversations.updatedAt));

  return c.json({ success: true, data: conversations });
});

// ---------- POST /projects/:id/suggest — AI-powered next prompt suggestion ----------

workspaceChatRoutes.post("/projects/:id/suggest", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const db = createDb(c.env.DB);

  // Verify project ownership
  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  // Get user's AI settings
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiApiKeyEncrypted || !settings?.aiProvider) {
    return c.json({ success: false, data: { suggestion: null } }, 200);
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, data: { suggestion: null } }, 200);
  }

  // Parse request — optional conversationId
  const body = await c.req.json<{ conversationId?: string }>().catch(() => ({}));
  const conversationId = (body as { conversationId?: string }).conversationId;

  // Build context from last messages
  let contextSummary = "";
  if (conversationId) {
    const recentMsgs = await db
      .select()
      .from(workspaceMessages)
      .where(eq(workspaceMessages.conversationId, conversationId))
      .orderBy(desc(workspaceMessages.createdAt))
      .limit(6);

    // Reverse to chronological order and build a compact summary
    const ordered = recentMsgs.reverse();
    contextSummary = ordered
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const role = m.role === "user" ? "Usuário" : "Assistente";
        // Truncate long messages
        const content = m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content;
        return `${role}: ${content}`;
      })
      .join("\n");
  }

  // Get student info for context
  let studentContext = "";
  if (project.studentId) {
    const student = await db
      .select()
      .from(students)
      .where(
        and(eq(students.id, project.studentId), eq(students.userId, userId))
      )
      .get();
    if (student) {
      studentContext = `\nAluno: ${student.name}${student.diagnosis ? ` (${student.diagnosis})` : ""}${student.grade ? `, ${student.grade}` : ""}`;
    }
  }

  // Get file listing for context
  const files = await db
    .select({ path: workspaceFiles.path })
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, projectId));
  const fileList = files.map((f) => f.path).join(", ");

  try {
    const provider = createAIProvider(settings.aiProvider!, apiKey);
    const model = getSuggestModel(
      settings.aiProvider!,
      normalizeModel(settings.aiModel || getDefaultModel(settings.aiProvider!))
    );

    const messages: AIMessage[] = [
      {
        role: "system",
        content: `Você é um assistente que sugere o próximo comando que o usuário provavelmente deseja no Estúdio AEE+, uma ferramenta de geração de documentos educacionais especializados (AEE).

Regras:
- Retorne APENAS uma frase curta e direta (máximo 15 palavras), como se fosse o próprio usuário digitando
- NÃO use aspas, explicações ou prefixos
- A sugestão deve ser o passo lógico seguinte baseado na conversa
- Use português brasileiro informal
- Se não houver contexto, sugira algo genérico útil para o fluxo AEE${studentContext}
${fileList ? `\nArquivos no projeto: ${fileList}` : ""}`,
      },
      {
        role: "user",
        content: contextSummary
          ? `Baseado nesta conversa recente, qual seria o próximo pedido mais provável do usuário?\n\n${contextSummary}`
          : "Qual seria um bom primeiro comando para começar a trabalhar neste projeto AEE?",
      },
    ];

    const result = await provider.generate({
      model,
      messages,
      maxTokens: 60,
      temperature: 0.7,
    });

    // Clean up the suggestion — remove quotes, trailing punctuation
    let suggestion = result.content
      .trim()
      .replace(/^["'""]|["'""]$/g, "")
      .replace(/\n.*/s, "") // Only first line
      .trim();

    // Cap length
    if (suggestion.length > 120) {
      suggestion = suggestion.slice(0, 120).replace(/\s\S*$/, "…");
    }

    return c.json({ success: true, data: { suggestion } });
  } catch (err) {
    console.error("[workspace-chat] suggest error:", err);
    return c.json({ success: false, data: { suggestion: null } }, 200);
  }
});

// ---------- helpers ----------

/** Normalize deprecated preview model IDs to current stable ones */
function normalizeModel(model: string): string {
  const replacements: Record<string, string> = {
    "gemini-2.5-flash-preview-05-20": "gemini-2.5-flash",
    "gemini-2.5-pro-preview-05-06": "gemini-2.5-pro",
    "google/gemini-2.5-flash-preview-05-20": "google/gemini-2.5-flash",
    "google/gemini-2.5-pro-preview-05-06": "google/gemini-2.5-pro",
  };
  return replacements[model] || model;
}

function getDefaultModel(provider: string): string {
  const defaults: Record<string, string> = {
    anthropic: "claude-sonnet-4-6",
    openai: "gpt-4.1-mini",
    gemini: "gemini-2.5-flash",
    groq: "llama-3.3-70b-versatile",
    deepseek: "deepseek-chat",
    mistral: "mistral-large-latest",
    openrouter: "google/gemini-2.5-flash",
    together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  };
  return defaults[provider] || "claude-sonnet-4-6";
}

/** Pick the cheapest/fastest model for the user's provider (suggestion only) */
function getSuggestModel(provider: string, _userModel: string): string {
  const fast: Record<string, string> = {
    anthropic: "claude-haiku-4-5-20251001",
    openai: "gpt-4.1-nano",
    gemini: "gemini-2.5-flash",
    groq: "llama-3.1-8b-instant",
    deepseek: "deepseek-chat",
    mistral: "mistral-small-latest",
    openrouter: "google/gemini-2.5-flash",
    together: "meta-llama/Llama-3.1-8B-Instruct-Turbo",
  };
  return fast[provider] || _userModel;
}
