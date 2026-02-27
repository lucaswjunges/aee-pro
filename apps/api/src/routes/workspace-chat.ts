import { Hono } from "hono";
import { eq, and, desc, gt } from "drizzle-orm";
import {
  workspaceProjects,
  workspaceFiles,
  workspaceConversations,
  workspaceMessages,
  students,
  prompts,
} from "@aee-pro/db/schema";
import { userSettings } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { runAgentLoop } from "../lib/agent/loop";
import type { ToolExecContext } from "../lib/agent/tool-executor";
import { createAIProvider } from "../lib/ai";
import type { AIMessage } from "../lib/ai";
import { buildSystemPrompt } from "../lib/agent/system-prompt";
import { packProjectFiles, syncFilesBack } from "../lib/agent/file-packager";
import type { PackedFile } from "../lib/agent/file-packager";
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
    qualityMode?: "standard" | "promax";
  }>();

  if (!body.message?.trim()) {
    return c.json({ success: false, error: "Mensagem é obrigatória" }, 400);
  }

  // Validate Pro Max — needs agent service or a provider that can reach Claude Opus
  const qualityMode = body.qualityMode || "standard";
  if (qualityMode === "promax" && !c.env.AGENT_SERVICE_URL) {
    const proMaxError = validateProMaxProvider(settings.aiProvider!);
    if (proMaxError) {
      return c.json({ success: false, error: proMaxError }, 400);
    }
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

          // Format as system metadata — NOT as a format for the AI to mimic.
          // Using <hist-action> tags that the AI recognizes as read-only context.
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
              parts.push(`<hist-action tool="${ev.tool}">${inputSummary}</hist-action>`);
            } else if (ev.type === "tool_result" && ev.tool) {
              const resultStr =
                typeof ev.result === "string"
                  ? ev.result
                  : ev.result && typeof ev.result === "object" && "output" in (ev.result as Record<string, unknown>)
                    ? String((ev.result as Record<string, unknown>).output)
                    : JSON.stringify(ev.result);
              const truncated = resultStr.length > 300 ? resultStr.slice(0, 300) + "…" : resultStr;
              parts.push(`<hist-result tool="${ev.tool}">${truncated}</hist-result>`);
            } else if (ev.type === "agent_spawn") {
              const hasResult = ev.agentId && completedAgentIds.has(ev.agentId);
              if (hasResult) {
                parts.push(`<hist-action tool="sub-agente">${ev.agentTask || "tarefa"}</hist-action>`);
              } else {
                parts.push(`<hist-action tool="sub-agente" status="INTERROMPIDO">${ev.agentTask || "tarefa"} — precisa ser refeita</hist-action>`);
              }
            } else if (ev.type === "agent_result") {
              const res = ev.content || "";
              const truncated = res.length > 300 ? res.slice(0, 300) + "…" : res;
              parts.push(`<hist-result tool="sub-agente">${truncated}</hist-result>`);
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

  // --- Progressive save: INSERT now, UPDATE periodically, UPDATE final ---
  console.log(`[chat] qualityMode=${qualityMode}, AGENT_SERVICE_URL=${c.env.AGENT_SERVICE_URL || "NOT SET"}`);
  return createStreamingAgentResponse({
    db, c, conversationId: conversationId!, projectId, userId,
    settings, apiKey, project, studentInfo, files,
    claudeMessages, conversationSummary, qualityMode,
    toolCtx: {
      db,
      r2: c.env.R2,
      userId,
      projectId,
      compilerUrl: c.env.LATEX_COMPILER_URL,
      compilerToken: c.env.LATEX_COMPILER_TOKEN,
      aiApiKey: apiKey,
      aiProvider: settings.aiProvider!,
      qualityMode,
    },
  });
});

// ---------- DELETE /projects/:id/messages/:messageId — delete a message ----------

workspaceChatRoutes.delete("/projects/:id/messages/:messageId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const messageId = c.req.param("messageId");
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

  // Find the message and verify it belongs to this project's conversation
  const message = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.id, messageId))
    .get();

  if (!message) {
    return c.json({ success: false, error: "Mensagem não encontrada" }, 404);
  }

  // Verify conversation belongs to this project
  const conversation = await db
    .select()
    .from(workspaceConversations)
    .where(
      and(
        eq(workspaceConversations.id, message.conversationId),
        eq(workspaceConversations.projectId, projectId)
      )
    )
    .get();

  if (!conversation) {
    return c.json({ success: false, error: "Mensagem não pertence a este projeto" }, 403);
  }

  const deletedIds: string[] = [messageId];

  // If user message, also delete the next assistant message (orphaned response)
  if (message.role === "user") {
    const nextAssistant = await db
      .select()
      .from(workspaceMessages)
      .where(
        and(
          eq(workspaceMessages.conversationId, message.conversationId),
          gt(workspaceMessages.createdAt, message.createdAt)
        )
      )
      .orderBy(workspaceMessages.createdAt)
      .limit(1)
      .then((rows) => rows[0]);

    if (nextAssistant && nextAssistant.role === "assistant") {
      await db
        .delete(workspaceMessages)
        .where(eq(workspaceMessages.id, nextAssistant.id));
      deletedIds.push(nextAssistant.id);
    }
  }

  // Delete the target message
  await db.delete(workspaceMessages).where(eq(workspaceMessages.id, messageId));

  return c.json({ success: true, data: { deletedIds } });
});

// ---------- POST /projects/:id/messages/:messageId/regenerate — regenerate assistant response ----------

workspaceChatRoutes.post("/projects/:id/messages/:messageId/regenerate", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env.DB);

  // Parse optional body (qualityMode)
  const regenBody = await c.req.json<{ qualityMode?: "standard" | "promax" }>().catch(() => ({}));
  const regenQualityMode = (regenBody as { qualityMode?: string }).qualityMode === "promax" ? "promax" as const : "standard" as const;

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

  // Find the assistant message to regenerate
  const message = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.id, messageId))
    .get();

  let conversationId: string;

  if (message) {
    // Message exists — verify it's an assistant message
    if (message.role !== "assistant") {
      return c.json({ success: false, error: "Só é possível regenerar mensagens do assistente" }, 400);
    }

    // Verify conversation belongs to this project
    const conversation = await db
      .select()
      .from(workspaceConversations)
      .where(
        and(
          eq(workspaceConversations.id, message.conversationId),
          eq(workspaceConversations.projectId, projectId)
        )
      )
      .get();

    if (!conversation) {
      return c.json({ success: false, error: "Mensagem não pertence a este projeto" }, 403);
    }

    conversationId = message.conversationId;

    // Delete the old assistant message
    await db.delete(workspaceMessages).where(eq(workspaceMessages.id, messageId));
  } else {
    // Message was already deleted (orphan cleanup or race condition)
    // Fall back to the latest conversation for this project
    const latestConvo = await db
      .select()
      .from(workspaceConversations)
      .where(eq(workspaceConversations.projectId, projectId))
      .orderBy(desc(workspaceConversations.updatedAt))
      .get();

    if (!latestConvo) {
      return c.json({ success: false, error: "Nenhuma conversa encontrada no projeto" }, 404);
    }

    conversationId = latestConvo.id;
  }

  // Get user's AI settings
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiApiKeyEncrypted || !settings?.aiProvider) {
    return c.json(
      { success: false, error: "Configure sua chave de IA em Configurações antes de usar o Estúdio." },
      400
    );
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar chave de IA." }, 500);
  }

  // Fetch conversation history (now without the deleted assistant message)
  const history = await db
    .select()
    .from(workspaceMessages)
    .where(eq(workspaceMessages.conversationId, conversationId))
    .orderBy(workspaceMessages.createdAt)
    .limit(40);

  // Smart history windowing (same as POST /chat)
  const KEEP_RECENT = 10;
  let conversationSummary: string | undefined;
  let messagesToConvert = history;

  if (history.length > KEEP_RECENT) {
    const olderMessages = history.slice(0, history.length - KEEP_RECENT);
    const recentMessages = history.slice(history.length - KEEP_RECENT);

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

  // Build messages array for the AI (same logic as POST /chat)
  const claudeMessages = messagesToConvert
    .map((msg) => {
      if (msg.role === "tool_result") return null;
      if (msg.role === "assistant" && msg.toolCalls) {
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

          const completedAgentIds = new Set(
            events.filter((e) => e.type === "agent_result" && e.agentId).map((e) => e.agentId!)
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
                parts.push(`[Sub-agente INTERROMPIDO — NÃO completou: ${ev.agentTask || "tarefa"}. A tarefa precisa ser refeita.]`);
              }
            } else if (ev.type === "agent_result") {
              const res = ev.content || "";
              parts.push(
                `[Resultado sub-agente: ${res.length > 300 ? res.slice(0, 300) + "…" : res}]`
              );
            }
          }
        } catch { /* ignore */ }
        const summary = parts.join("\n");
        if (!summary.trim()) return null;
        return { role: "assistant" as const, content: summary };
      }
      return { role: msg.role as "user" | "assistant", content: msg.content };
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
      .where(and(eq(students.id, project.studentId), eq(students.userId, userId)))
      .get();
    if (student) {
      studentInfo = { name: student.name, diagnosis: student.diagnosis, grade: student.grade };
    }
  }

  // Validate Pro Max — needs agent service or a provider that can reach Claude Opus
  if (regenQualityMode === "promax" && !c.env.AGENT_SERVICE_URL) {
    const proMaxError = validateProMaxProvider(settings.aiProvider!);
    if (proMaxError) {
      return c.json({ success: false, error: proMaxError }, 400);
    }
  }

  // --- Progressive save: INSERT now, UPDATE periodically, UPDATE final ---
  return createStreamingAgentResponse({
    db, c, conversationId, projectId, userId,
    settings, apiKey, project, studentInfo, files,
    claudeMessages, conversationSummary,
    qualityMode: regenQualityMode,
    toolCtx: {
      db,
      r2: c.env.R2,
      userId,
      projectId,
      compilerUrl: c.env.LATEX_COMPILER_URL,
      compilerToken: c.env.LATEX_COMPILER_TOKEN,
      aiApiKey: apiKey,
      aiProvider: settings.aiProvider!,
      qualityMode: regenQualityMode,
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

    // Clean up orphaned progressive-save placeholders (empty or "(processando...)")
    const orphans = messages.filter(
      (m) => m.role === "assistant" && (!m.content || m.content === "(processando...)")
    );
    if (orphans.length > 0) {
      await Promise.all(
        orphans.map((m) =>
          db.delete(workspaceMessages).where(eq(workspaceMessages.id, m.id))
        )
      );
    }

    return c.json({
      success: true,
      data: messages.filter(
        (m) => m.content && m.content !== "(processando...)"
      ),
    });
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

// ---------- streaming agent response (shared by /chat and /regenerate) ----------

/**
 * Creates an SSE streaming response that runs the agent loop.
 * Progressive save: INSERT immediately → UPDATE every 3s → final UPDATE on done.
 * Even if the Worker crashes mid-stream, partial content is already in the DB.
 */
async function createStreamingAgentResponse(opts: {
  db: ReturnType<typeof createDb>;
  c: { executionCtx: { waitUntil: (p: Promise<unknown>) => void }; env?: { AGENT_SERVICE_URL?: string; AGENT_SERVICE_TOKEN?: string; R2?: R2Bucket; DB?: D1Database } };
  conversationId: string;
  projectId: string;
  userId: string;
  settings: { aiProvider: string | null; aiModel: string | null; maxOutputTokens: number | null };
  apiKey: string;
  project: { id: string; name: string; description: string | null; studentId: string | null };
  studentInfo: { name: string; diagnosis: string | null; grade: string | null } | null;
  files: Parameters<typeof runAgentLoop>[0]["files"];
  claudeMessages: Array<{ role: "user" | "assistant"; content: string }>;
  conversationSummary?: string;
  qualityMode?: "standard" | "promax";
  toolCtx: ToolExecContext;
}): Promise<Response> {
  const { db, c, conversationId, projectId, userId, settings, apiKey, project, studentInfo, files, claudeMessages, conversationSummary, qualityMode, toolCtx } = opts;

  // --- Pro Max via Fly.io Agent Service ---
  console.log(`[streaming] qualityMode=${qualityMode}, AGENT_SERVICE_URL=${c.env?.AGENT_SERVICE_URL || "NOT SET"}`);
  if (qualityMode === "promax" && c.env?.AGENT_SERVICE_URL) {
    console.log("[streaming] → Routing to Agent Service (Pro Max)");

    return createProMaxAgentResponse({
      db, c: c as { executionCtx: { waitUntil: (p: Promise<unknown>) => void }; env: { AGENT_SERVICE_URL: string; AGENT_SERVICE_TOKEN?: string; R2: R2Bucket; DB: D1Database } },
      conversationId, projectId, userId, project, studentInfo, files,
      claudeMessages, conversationSummary,
    });
  }

  // --- Progressive save state ---
  const assistantMsgId = crypto.randomUUID();
  const assistantTextParts: string[] = [];
  const toolCallsData: unknown[] = [];
  let lastFlushAt = 0;
  let finalized = false;
  const FLUSH_INTERVAL_MS = 3_000;

  // INSERT the message row immediately so it exists in DB from the start
  await db.insert(workspaceMessages).values({
    id: assistantMsgId,
    conversationId,
    role: "assistant",
    content: "",
    toolCalls: null,
    createdAt: new Date().toISOString(),
  });
  lastFlushAt = Date.now();

  /** Flush current accumulated content to DB (non-destructive UPDATE) */
  async function flushToDb() {
    try {
      const text = assistantTextParts.join("");
      const tc = toolCallsData;
      await db
        .update(workspaceMessages)
        .set({
          content: text || "(processando...)",
          toolCalls: tc.length > 0 ? JSON.stringify(tc) : null,
        })
        .where(eq(workspaceMessages.id, assistantMsgId));
      lastFlushAt = Date.now();
    } catch (err) {
      console.error("[workspace-chat] Flush failed:", err);
    }
  }

  /** Periodic flush — call after each event, only writes if interval elapsed */
  async function maybeFlush() {
    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
      await flushToDb();
    }
  }

  /** Final save: write content + update timestamps. Idempotent. */
  async function finalizeMessage() {
    if (finalized) return;
    finalized = true;
    try {
      const text = assistantTextParts.join("");
      const tc = toolCallsData;
      if (!text && tc.length === 0) {
        // Nothing was produced — remove the empty placeholder
        await db.delete(workspaceMessages).where(eq(workspaceMessages.id, assistantMsgId));
        return;
      }
      await db
        .update(workspaceMessages)
        .set({
          content: text || "(tool calls only)",
          toolCalls: tc.length > 0 ? JSON.stringify(tc) : null,
        })
        .where(eq(workspaceMessages.id, assistantMsgId));

      const now = new Date().toISOString();
      await db.update(workspaceConversations).set({ updatedAt: now }).where(eq(workspaceConversations.id, conversationId));
      await db.update(workspaceProjects).set({ updatedAt: now }).where(eq(workspaceProjects.id, projectId));
    } catch (err) {
      console.error("[workspace-chat] Finalize failed:", err);
    }
  }

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
        const isProMax = qualityMode === "promax";
        // Pro Max forces Claude Opus and 32K output
        const model = isProMax
          ? getProMaxModel(providerType)
          : normalizeModel(settings.aiModel || getDefaultModel(providerType));
        // Pro Max: 32K for direct Anthropic, 16K for OpenRouter (cheaper)
        const maxOut = isProMax
          ? (providerType === "anthropic" ? 32000 : 16000)
          : (settings.maxOutputTokens || undefined);

        const agentLoop = runAgentLoop({
          apiKey,
          providerType,
          model,
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            studentId: project.studentId,
          },
          student: studentInfo,
          files,
          messages: claudeMessages,
          toolCtx,
          enableThinking: providerType === "anthropic",
          conversationSummary,
          maxOutputTokens: maxOut,
          qualityMode,
        });

        for await (const event of agentLoop) {
          // Collect data
          if (event.type === "text" && event.content) {
            assistantTextParts.push(event.content);
          }
          if (event.type === "error" && event.content) {
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

          // Periodic flush to DB (every 3s)
          await maybeFlush();

          // Final save BEFORE sending "done" to client
          if (event.type === "done") {
            await finalizeMessage();
          }

          const sseData = JSON.stringify(event);
          safeSend(`data: ${sseData}\n\n`);
          safeSend(": flush\n\n");
        }

        // Fallback finalize (if loop ended without "done")
        await finalizeMessage();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[workspace-chat] Agent loop error:", msg);
        assistantTextParts.push(`\n\nErro: ${msg}`);
        await finalizeMessage();
        safeSend(`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`);
      }

      try { controller.close(); } catch { /* already cancelled */ }
    },
  });

  // Safety net: keep Worker alive until finalized
  c.executionCtx.waitUntil(
    new Promise<void>((resolve) => {
      const start = Date.now();
      const TIMEOUT_MS = 120_000;
      const check = () => {
        if (finalized || Date.now() - start > TIMEOUT_MS) {
          if (!finalized) {
            finalizeMessage().finally(resolve);
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
}

// ---------- Pro Max via Fly.io Agent Service ----------

/**
 * Proxy a Pro Max request to the Fly.io agent service.
 * Packs files from R2, sends to agent service, relays SSE back to frontend,
 * and syncs changed files back to R2/D1.
 */
async function createProMaxAgentResponse(opts: {
  db: ReturnType<typeof createDb>;
  c: {
    executionCtx: { waitUntil: (p: Promise<unknown>) => void };
    env: { AGENT_SERVICE_URL: string; AGENT_SERVICE_TOKEN?: string; R2: R2Bucket; DB: D1Database };
  };
  conversationId: string;
  projectId: string;
  userId: string;
  project: { id: string; name: string; description: string | null; studentId: string | null };
  studentInfo: { name: string; diagnosis: string | null; grade: string | null } | null;
  files: Array<{ path: string; mimeType: string; sizeBytes: number | null }>;
  claudeMessages: Array<{ role: "user" | "assistant"; content: string }>;
  conversationSummary?: string;
}): Promise<Response> {
  const { db, c, conversationId, projectId, userId, project, studentInfo, files, claudeMessages, conversationSummary } = opts;

  // --- Progressive save state ---
  const assistantMsgId = crypto.randomUUID();
  const assistantTextParts: string[] = [];
  const toolCallsData: unknown[] = [];
  let lastFlushAt = 0;
  let finalized = false;
  const FLUSH_INTERVAL_MS = 3_000;

  await db.insert(workspaceMessages).values({
    id: assistantMsgId,
    conversationId,
    role: "assistant",
    content: "",
    toolCalls: null,
    createdAt: new Date().toISOString(),
  });
  lastFlushAt = Date.now();

  async function flushToDb() {
    try {
      const text = assistantTextParts.join("");
      const tc = toolCallsData;
      await db.update(workspaceMessages)
        .set({ content: text || "(processando...)", toolCalls: tc.length > 0 ? JSON.stringify(tc) : null })
        .where(eq(workspaceMessages.id, assistantMsgId));
      lastFlushAt = Date.now();
    } catch (err) { console.error("[promax-proxy] Flush failed:", err); }
  }

  async function maybeFlush() {
    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) await flushToDb();
  }

  async function finalizeMessage() {
    if (finalized) return;
    finalized = true;
    try {
      const text = assistantTextParts.join("");
      const tc = toolCallsData;
      if (!text && tc.length === 0) {
        await db.delete(workspaceMessages).where(eq(workspaceMessages.id, assistantMsgId));
        return;
      }
      await db.update(workspaceMessages)
        .set({ content: text || "(tool calls only)", toolCalls: tc.length > 0 ? JSON.stringify(tc) : null })
        .where(eq(workspaceMessages.id, assistantMsgId));
      const now = new Date().toISOString();
      await db.update(workspaceConversations).set({ updatedAt: now }).where(eq(workspaceConversations.id, conversationId));
      await db.update(workspaceProjects).set({ updatedAt: now }).where(eq(workspaceProjects.id, projectId));
    } catch (err) { console.error("[promax-proxy] Finalize failed:", err); }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let streamCancelled = false;
      function safeSend(chunk: string) {
        if (streamCancelled) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { streamCancelled = true; }
      }

      try {
        // 1. Pack project files from R2
        console.log("[promax-proxy] Packing project files...");
        const packedFiles = await packProjectFiles(projectId, userId, db, c.env.R2);
        console.log(`[promax-proxy] Packed ${packedFiles.length} files`);

        // 2. Build system prompt
        const systemPrompt = buildSystemPrompt({
          projectName: project.name,
          projectDescription: project.description,
          studentName: studentInfo?.name || null,
          studentDiagnosis: studentInfo?.diagnosis || null,
          studentGrade: studentInfo?.grade || null,
          files: files as Parameters<typeof buildSystemPrompt>[0]["files"],
          conversationSummary,
          qualityMode: "promax",
        });

        // 3. Pre-fetch student data
        let studentDataText: string | null = null;
        if (project.studentId) {
          const student = await db.select().from(students)
            .where(and(eq(students.id, project.studentId), eq(students.userId, userId)))
            .get();
          if (student) {
            studentDataText = Object.entries(student)
              .filter(([_, v]) => v != null && v !== "")
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n");
          }
        }

        // 4. Pre-fetch prompt templates
        const allPrompts = await db.select({ slug: prompts.slug, promptTemplate: prompts.promptTemplate })
          .from(prompts)
          .where(eq(prompts.isBuiltIn, true));
        const promptTemplates: Record<string, string> = {};
        for (const p of allPrompts) {
          if (p.slug && p.promptTemplate) {
            promptTemplates[p.slug] = p.promptTemplate;
          }
        }

        // 5. POST to agent service
        const agentUrl = `${c.env.AGENT_SERVICE_URL}/agent/run`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (c.env.AGENT_SERVICE_TOKEN) {
          headers["Authorization"] = `Bearer ${c.env.AGENT_SERVICE_TOKEN}`;
        }

        console.log(`[promax-proxy] Sending to ${agentUrl}...`);
        const agentResponse = await fetch(agentUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            files: packedFiles,
            systemPrompt,
            messages: claudeMessages,
            studentData: studentDataText,
            promptTemplates,
            projectId,
            maxTurns: 35,
            maxThinkingTokens: 16000,
          }),
        });

        if (!agentResponse.ok) {
          const errText = await agentResponse.text();
          throw new Error(`Agent service returned ${agentResponse.status}: ${errText}`);
        }

        // 6. Read SSE stream from agent service and relay to frontend
        const reader = agentResponse.body?.getReader();
        if (!reader) throw new Error("No response body from agent service");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              let event: { type: string; content?: string; tool?: string; toolInput?: unknown; result?: string; files?: PackedFile[]; cost?: number };
              try {
                event = JSON.parse(dataStr);
              } catch {
                continue; // Skip malformed events
              }

              // Handle files_sync — consumed by Worker, not sent to frontend
              if (event.type === "files_sync" && event.files) {
                console.log(`[promax-proxy] Syncing ${event.files.length} files back to R2`);
                try {
                  const syncResult = await syncFilesBack(event.files, projectId, userId, db, c.env.R2);
                  console.log(`[promax-proxy] Synced: ${syncResult.created} created, ${syncResult.updated} updated`);
                } catch (syncErr) {
                  console.error("[promax-proxy] File sync failed:", syncErr);
                }
                continue; // Don't forward to frontend
              }

              // Collect data for progressive save
              if (event.type === "text" && event.content) {
                assistantTextParts.push(event.content);
              }
              if (event.type === "error" && event.content) {
                assistantTextParts.push(`\n\nErro: ${event.content}`);
              }
              if (event.type === "tool_call" || event.type === "tool_result") {
                toolCallsData.push(event);
              }

              // Periodic flush
              await maybeFlush();

              // Final save before "done"
              if (event.type === "done") {
                await finalizeMessage();
              }

              // Relay to frontend
              safeSend(`data: ${dataStr}\n\n`);
              safeSend(": flush\n\n");
            }
            // Skip comments (keepalive) and empty lines
          }
        }

        // Fallback finalize
        await finalizeMessage();

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[promax-proxy] Error:", msg);
        assistantTextParts.push(`\n\nErro: ${msg}`);
        await finalizeMessage();
        safeSend(`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`);
      }

      try { controller.close(); } catch { /* already cancelled */ }
    },
  });

  // Safety net
  c.executionCtx.waitUntil(
    new Promise<void>((resolve) => {
      const start = Date.now();
      const TIMEOUT_MS = 600_000; // 10 min for Pro Max
      const check = () => {
        if (finalized || Date.now() - start > TIMEOUT_MS) {
          if (!finalized) finalizeMessage().finally(resolve);
          else resolve();
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
}

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

/** Providers that can reach Claude Opus for Pro Max mode */
const PRO_MAX_PROVIDERS: Record<string, string> = {
  anthropic: "claude-opus-4-6",
  openrouter: "anthropic/claude-opus-4-6",
};

/** Validate that the user's provider supports Pro Max. Returns error string or null. */
function validateProMaxProvider(provider: string): string | null {
  if (PRO_MAX_PROVIDERS[provider]) return null;
  return "Modo Pro Max requer provedor Anthropic ou OpenRouter (que acessa Claude Opus). Configure em Configurações.";
}

/** Get the correct Claude Opus model ID for the user's provider */
function getProMaxModel(provider: string): string {
  return PRO_MAX_PROVIDERS[provider] || "claude-opus-4-6";
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
