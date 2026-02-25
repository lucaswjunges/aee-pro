import { WORKSPACE_TOOLS, SUBAGENT_TOOLS, type ToolDefinition } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { executeTool, type ToolExecContext } from "./tool-executor";
import type { WorkspaceFile } from "@aee-pro/shared";

export interface AgentLoopOptions {
  /** User's AI API key (decrypted) */
  apiKey: string;
  /** AI provider type */
  providerType: string;
  /** AI model to use */
  model: string;
  /** Project metadata */
  project: {
    id: string;
    name: string;
    description: string | null;
    studentId: string | null;
  };
  /** Student info (if linked) */
  student: {
    name: string;
    diagnosis: string | null;
    grade: string | null;
  } | null;
  /** Files in the project */
  files: WorkspaceFile[];
  /** Conversation history (Claude format) */
  messages: ClaudeMessage[];
  /** Tool execution context */
  toolCtx: ToolExecContext;
  /** Max agent loop iterations */
  maxIterations?: number;
  /** Whether this is a sub-agent */
  isSubAgent?: boolean;
  /** Enable extended thinking (Anthropic only) */
  enableThinking?: boolean;
  /** Summary of older conversation messages */
  conversationSummary?: string;
  /** User-configured max output tokens (overrides default) */
  maxOutputTokens?: number;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface SSEEvent {
  type:
    | "text"
    | "tool_call"
    | "tool_result"
    | "agent_spawn"
    | "agent_result"
    | "thinking"
    | "error"
    | "done";
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: unknown;
  agentId?: string;
  agentTask?: string;
}

// ---------------------------------------------------------------------------
// Agent Loop
// ---------------------------------------------------------------------------

/**
 * Runs the agentic loop, yielding SSE events.
 * Streams text token-by-token for Anthropic; blocking for other providers.
 */
export async function* runAgentLoop(
  opts: AgentLoopOptions
): AsyncGenerator<SSEEvent> {
  const maxIter = opts.maxIterations ?? 25;
  const tools: ToolDefinition[] = opts.isSubAgent
    ? SUBAGENT_TOOLS
    : WORKSPACE_TOOLS;

  const systemPrompt = buildSystemPrompt({
    projectName: opts.project.name,
    projectDescription: opts.project.description,
    studentName: opts.student?.name ?? null,
    studentDiagnosis: opts.student?.diagnosis ?? null,
    studentGrade: opts.student?.grade ?? null,
    files: opts.files,
    isSubAgent: opts.isSubAgent,
    conversationSummary: opts.conversationSummary,
  });

  const messages: ClaudeMessage[] = [...opts.messages];
  const isAnthropic = opts.providerType === "anthropic";
  const enableThinking = opts.enableThinking && isAnthropic && supportsThinking(opts.model);
  const defaultMax = getMaxTokens(opts.model, isAnthropic);
  const maxTokens = opts.maxOutputTokens
    ? Math.min(opts.maxOutputTokens, defaultMax)
    : defaultMax;

  for (let iteration = 0; iteration < maxIter; iteration++) {
    let response: {
      content: ClaudeContentBlock[];
      stop_reason: string;
    };

    try {
      if (isAnthropic) {
        // ---- Streaming path for Anthropic ----
        const accumulated: ClaudeContentBlock[] = [];
        let stopReason = "end_turn";

        for await (const chunk of streamAnthropicWithTools(
          opts.apiKey,
          opts.model,
          systemPrompt,
          messages,
          tools,
          { thinking: enableThinking, maxTokens }
        )) {
          if (chunk.type === "text_delta" && chunk.text) {
            yield { type: "text", content: chunk.text };
          } else if (chunk.type === "thinking_delta" && chunk.thinking) {
            yield { type: "thinking", content: chunk.thinking };
          } else if (chunk.type === "complete" && chunk.response) {
            accumulated.push(...chunk.response.content);
            stopReason = chunk.response.stop_reason;
          }
        }

        response = { content: accumulated, stop_reason: stopReason };
      } else {
        // ---- Blocking path for OpenAI-compatible providers ----
        response = await callOpenAICompatibleWithTools(
          opts.apiKey,
          opts.providerType,
          opts.model,
          systemPrompt,
          messages,
          tools,
          maxTokens
        );

        // Yield text blocks after receiving complete response
        for (const block of response.content) {
          if (block.type === "text" && block.text) {
            yield { type: "text", content: block.text };
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Provide user-friendly error messages for common API errors
      const friendlyMsg = getFriendlyError(msg, opts.providerType);
      yield { type: "error", content: friendlyMsg };
      return;
    }

    // Collect tool_use blocks (skip text/thinking — already yielded)
    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use"
    );

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0) {
      yield { type: "done" };
      return;
    }

    // Add assistant message to history (includes thinking blocks for Anthropic validation)
    messages.push({ role: "assistant", content: response.content });

    // Execute tools — parallel for normal tools, sequential for spawn_agent
    const toolResults: ClaudeContentBlock[] = [];
    const spawnBlocks = toolUseBlocks.filter((b) => b.name === "spawn_agent");
    const normalBlocks = toolUseBlocks.filter((b) => b.name !== "spawn_agent");

    // Yield all tool_call events immediately so frontend shows progress
    for (const toolBlock of toolUseBlocks) {
      yield {
        type: "tool_call",
        tool: toolBlock.name!,
        toolInput: toolBlock.input!,
      };
    }

    // Execute normal tools in parallel
    if (normalBlocks.length > 0) {
      const parallelResults = await Promise.all(
        normalBlocks.map(async (toolBlock) => {
          const result = await executeTool(
            toolBlock.name!,
            toolBlock.input!,
            opts.toolCtx
          );
          return { toolBlock, result };
        })
      );

      for (const { toolBlock, result } of parallelResults) {
        yield {
          type: "tool_result",
          tool: toolBlock.name!,
          result,
        };

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result.success
            ? result.output || "OK"
            : `ERRO: ${result.error}`,
          is_error: !result.success,
        });
      }
    }

    // Execute spawn_agent blocks in PARALLEL (each works on independent files)
    if (spawnBlocks.length > 0) {
      // Yield all agent_spawn events immediately so frontend shows all agents starting
      const agentMeta = spawnBlocks.map((toolBlock) => {
        const toolInput = toolBlock.input!;
        const agentId = crypto.randomUUID().slice(0, 8);
        return { toolBlock, toolInput, agentId };
      });

      for (const { agentId, toolInput } of agentMeta) {
        yield {
          type: "agent_spawn",
          agentId,
          agentTask: toolInput.task as string,
        };
      }

      // Run all sub-agents in parallel
      const agentResults = await Promise.all(
        agentMeta.map(async ({ toolBlock, toolInput, agentId }) => {
          const subResult = await runSubAgent(
            toolInput.task as string,
            toolInput.context as string | undefined,
            opts
          );
          return { toolBlock, agentId, subResult };
        })
      );

      for (const { toolBlock, agentId, subResult } of agentResults) {
        yield {
          type: "agent_result",
          agentId,
          content: subResult,
        };

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: subResult,
        });
      }
    }

    // Add tool results to history
    messages.push({ role: "user", content: toolResults });

    // If AI said end_turn, stop
    if (response.stop_reason === "end_turn") {
      yield { type: "done" };
      return;
    }

    // Signal that AI is processing (next API call may take a while)
    yield { type: "thinking" };
  }

  yield {
    type: "text",
    content: "\n\n(Limite de iterações atingido. Peça para continuar se necessário.)",
  };
  yield { type: "done" };
}

// ---------------------------------------------------------------------------
// Sub-Agent Runner
// ---------------------------------------------------------------------------

async function runSubAgent(
  task: string,
  context: string | undefined,
  parentOpts: AgentLoopOptions
): Promise<string> {
  const subMessages: ClaudeMessage[] = [
    {
      role: "user",
      content: context ? `${task}\n\nContexto:\n${context}` : task,
    },
  ];

  const output: string[] = [];

  const subLoop = runAgentLoop({
    ...parentOpts,
    messages: subMessages,
    maxIterations: 10,
    isSubAgent: true,
  });

  for await (const event of subLoop) {
    if (event.type === "text" && event.content) {
      output.push(event.content);
    }
  }

  return output.join("") || "(sub-agente não produziu saída)";
}

// ---------------------------------------------------------------------------
// Anthropic Streaming API
// ---------------------------------------------------------------------------

interface StreamChunk {
  type: "text_delta" | "thinking_delta" | "complete";
  text?: string;
  thinking?: string;
  response?: {
    content: ClaudeContentBlock[];
    stop_reason: string;
  };
}

/**
 * Stream Anthropic Messages API with tool support.
 * Yields text/thinking deltas in real-time, then a complete response at the end.
 */
async function* streamAnthropicWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[],
  options: { thinking?: boolean; maxTokens: number }
): AsyncGenerator<StreamChunk> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    // System prompt with prompt caching
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: filterMessagesForAnthropic(messages),
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
    stream: true,
  };

  // Extended thinking for supported models
  if (options.thinking) {
    body.thinking = {
      type: "enabled",
      budget_tokens: Math.min(10000, Math.floor(options.maxTokens / 4)),
    };
    // Anthropic constraint: thinking requires temperature=1
    body.temperature = 1;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2025-04-15",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  if (!res.body) {
    throw new Error("Anthropic: response body is null (no streaming support)");
  }

  // Parse SSE stream
  const content: ClaudeContentBlock[] = [];
  let stopReason = "end_turn";

  // Track current block being built
  let currentBlockType: string | null = null;
  let toolJsonParts: string[] = [];
  let currentToolId: string | null = null;
  let currentToolName: string | null = null;
  let currentTextParts: string[] = [];
  let thinkingText = "";
  let thinkingSignature = "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const eventType = event.type as string;

        if (eventType === "content_block_start") {
          const block = event.content_block as Record<string, unknown>;
          currentBlockType = block.type as string;

          if (currentBlockType === "text") {
            currentTextParts = [];
          } else if (currentBlockType === "tool_use") {
            currentToolId = block.id as string;
            currentToolName = block.name as string;
            toolJsonParts = [];
          } else if (currentBlockType === "thinking") {
            thinkingText = "";
            thinkingSignature = "";
          }
        } else if (eventType === "content_block_delta") {
          const delta = event.delta as Record<string, unknown>;
          const deltaType = delta.type as string;

          if (deltaType === "text_delta") {
            const text = delta.text as string;
            currentTextParts.push(text);
            yield { type: "text_delta", text };
          } else if (deltaType === "input_json_delta") {
            toolJsonParts.push(delta.partial_json as string);
          } else if (deltaType === "thinking_delta") {
            const thinking = delta.thinking as string;
            thinkingText += thinking;
            yield { type: "thinking_delta", thinking };
          } else if (deltaType === "signature_delta") {
            thinkingSignature += delta.signature as string;
          }
        } else if (eventType === "content_block_stop") {
          if (currentBlockType === "text") {
            // Reconstruct full text block for message history
            const fullText = currentTextParts.join("");
            if (fullText) {
              content.push({ type: "text", text: fullText });
            }
            currentTextParts = [];
          } else if (currentBlockType === "tool_use") {
            let toolInput: Record<string, unknown> = {};
            try {
              const jsonStr = toolJsonParts.join("");
              if (jsonStr) toolInput = JSON.parse(jsonStr);
            } catch {
              // Malformed JSON — pass empty input
            }
            content.push({
              type: "tool_use",
              id: currentToolId!,
              name: currentToolName!,
              input: toolInput,
            });
            toolJsonParts = [];
            currentToolId = null;
            currentToolName = null;
          } else if (currentBlockType === "thinking") {
            content.push({
              type: "thinking",
              thinking: thinkingText,
              signature: thinkingSignature,
            });
          }
          currentBlockType = null;
        } else if (eventType === "message_delta") {
          const delta = event.delta as Record<string, unknown>;
          if (delta.stop_reason) {
            stopReason = delta.stop_reason as string;
          }
        } else if (eventType === "message_stop") {
          // Stream complete
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: "complete",
    response: { content, stop_reason: stopReason },
  };
}

/**
 * Filter messages for Anthropic API compatibility.
 * Removes thinking blocks from historical messages (only keep in current turn).
 */
function filterMessagesForAnthropic(
  messages: ClaudeMessage[]
): ClaudeMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    // Keep thinking blocks — Anthropic validates signatures
    return m;
  });
}

// ---------------------------------------------------------------------------
// OpenAI-Compatible Providers (blocking)
// ---------------------------------------------------------------------------

async function callOpenAICompatibleWithTools(
  apiKey: string,
  providerType: string,
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[],
  maxTokens: number
): Promise<{
  content: ClaudeContentBlock[];
  stop_reason: string;
}> {
  const endpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
  };

  const endpoint = endpoints[providerType];
  if (!endpoint) {
    throw new Error(`Provider ${providerType} não suporta tool use no Estúdio`);
  }

  // Convert messages to OpenAI format
  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      // Filter out thinking blocks (not supported by OpenAI)
      const filtered = m.content.filter((b) => b.type !== "thinking");

      const textParts = filtered
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const toolResultParts = filtered.filter((b) => b.type === "tool_result");

      if (toolResultParts.length > 0) {
        return toolResultParts.map((tr) => ({
          role: "tool" as const,
          tool_call_id: tr.tool_use_id,
          content: tr.content || "",
        }));
      }

      const toolUseParts = filtered.filter((b) => b.type === "tool_use");
      if (toolUseParts.length > 0) {
        return {
          role: m.role,
          content: textParts || null,
          tool_calls: toolUseParts.map((tu) => ({
            id: tu.id,
            type: "function",
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input),
            },
          })),
        };
      }

      return { role: m.role, content: textParts };
    }),
  ].flat();

  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (providerType === "gemini") {
    headers["x-goog-api-key"] = apiKey;
    delete headers["Authorization"];
  }

  // OpenAI-compatible providers cap at 16K (no streaming requirement)
  const cappedMaxTokens = Math.min(maxTokens, 16000);

  const requestBody: Record<string, unknown> = {
    model,
    messages: openaiMessages,
    tools: openaiTools,
    tool_choice: "auto",
    max_tokens: cappedMaxTokens,
  };

  // OpenRouter-specific optimizations
  if (providerType === "openrouter") {
    // middle-out: compress middle of conversation, keep start (system) and end (recent)
    requestBody.transforms = ["middle-out"];
    requestBody.provider = {
      allow_fallbacks: false,
    };
  }

  // Retry with exponential backoff for rate limits (429)
  const MAX_RETRIES = 3;
  let res: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Parse retry-after header or use exponential backoff
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter) * 1000, 30_000)
        : Math.min(2000 * Math.pow(2, attempt), 15_000); // 2s, 4s, 8s
      console.log(
        `[agent] Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }

  if (!res!.ok) {
    const err = await res!.text();
    throw new Error(`${providerType} API error (${res!.status}): ${err}`);
  }

  const data = (await res!.json()) as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason: string;
    }>;
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error("Resposta vazia do provider");
  }

  const content: ClaudeContentBlock[] = [];
  let hasNativeToolCalls = false;

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    hasNativeToolCalls = true;
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        // Some providers send malformed JSON in arguments
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  // Fallback: if no native tool calls, check if the model outputted tool calls as text
  // This happens with some models (e.g. Gemini via OpenRouter) that don't support
  // function calling properly and emit garbled text like:
  //   兵call:compile_latex{path:<ctrl46>main.tex<ctrl46>}
  if (!hasNativeToolCalls && choice.message.content) {
    const toolNames = tools.map((t) => t.name);
    const parsed = parseTextToolCalls(choice.message.content, toolNames);
    if (parsed) {
      // Replace garbled text with clean version
      content.length = 0;
      if (parsed.cleanedText) {
        content.push({ type: "text", text: parsed.cleanedText });
      }
      content.push(...parsed.toolCalls);
      console.log(
        `[agent] Parsed ${parsed.toolCalls.length} tool call(s) from text output (model: ${model})`
      );
      return { content, stop_reason: "tool_use" };
    }
  }

  const stopReason =
    choice.finish_reason === "tool_calls" ||
    choice.finish_reason === "function_call"
      ? "tool_use"
      : "end_turn";

  return { content, stop_reason: stopReason };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if model supports extended thinking */
function supportsThinking(model: string): boolean {
  const thinkingModels = [
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-haiku-4",
  ];
  return thinkingModels.some((m) => model.startsWith(m));
}

/** Dynamic max_tokens based on model capabilities */
function getMaxTokens(model: string, isAnthropic: boolean): number {
  if (!isAnthropic) return 16000;

  // Claude 4.x models support higher output
  if (model.startsWith("claude-opus-4")) return 32000;
  if (model.startsWith("claude-sonnet-4")) return 64000;
  if (model.startsWith("claude-haiku-4")) return 8192;

  // Default for unknown Anthropic models
  return 16000;
}

/**
 * Fallback parser for models that output tool calls as text instead of using
 * the native function calling API. Handles patterns like:
 *   兵call:compile_latex{path:<ctrl46>main.tex<ctrl46>}
 *   <tool_call>{"name":"tool","arguments":{"key":"val"}}</tool_call>
 *   tool_name({"key":"value"})
 *   compile_latex{"path":"main.tex"}
 */
function parseTextToolCalls(
  text: string,
  availableToolNames: string[]
): { toolCalls: ClaudeContentBlock[]; cleanedText: string } | null {
  if (!text || availableToolNames.length === 0) return null;

  // Step 1: Clean control character placeholders: <ctrl46> → '.' (char 46)
  let cleaned = text.replace(/<ctrl(\d+)>/g, (_, code) =>
    String.fromCharCode(parseInt(code))
  );

  const toolCalls: ClaudeContentBlock[] = [];
  let remainingText = cleaned;

  // Escape special regex chars in tool names
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = availableToolNames.map(escapeRe).join("|");

  // Pattern 1: [garbled chars]call:tool_name{key:value,key2:value2}
  // Handles: 兵call:compile_latex{path:main.tex}
  const callPattern = new RegExp(
    `[^\\s]*?call:(${namePattern})\\s*\\{([^}]*)\\}`,
    "gi"
  );

  // Pattern 2: tool_name({"key":"value"}) or tool_name({key:value})
  const funcCallPattern = new RegExp(
    `(${namePattern})\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`,
    "gi"
  );

  // Pattern 3: tool_name{"key":"value"} (no parens)
  const directJsonPattern = new RegExp(
    `(${namePattern})\\s*(\\{"[\\s\\S]*?\\})`,
    "gi"
  );

  // Pattern 4: <tool_call>{"name":"tool","arguments":{...}}</tool_call>
  const xmlPattern =
    /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/gi;

  let match: RegExpExecArray | null;

  // Try Pattern 1 (Gemini-style garbled)
  while ((match = callPattern.exec(cleaned)) !== null) {
    const toolName = findToolName(match[1], availableToolNames);
    if (!toolName) continue;
    const input = parseToolParams(match[2]);
    if (input) {
      toolCalls.push({
        type: "tool_use",
        id: `txt-${randomShortId()}`,
        name: toolName,
        input,
      });
      remainingText = remainingText.replace(match[0], "");
    }
  }

  // Try Pattern 2 (function-call style)
  if (toolCalls.length === 0) {
    while ((match = funcCallPattern.exec(cleaned)) !== null) {
      const toolName = findToolName(match[1], availableToolNames);
      if (!toolName) continue;
      try {
        const input = JSON.parse(match[2]);
        toolCalls.push({
          type: "tool_use",
          id: `txt-${randomShortId()}`,
          name: toolName,
          input,
        });
        remainingText = remainingText.replace(match[0], "");
      } catch {
        // Try parsing as key:value
        const input = parseToolParams(match[2].slice(1, -1));
        if (input) {
          toolCalls.push({
            type: "tool_use",
            id: `txt-${randomShortId()}`,
            name: toolName,
            input,
          });
          remainingText = remainingText.replace(match[0], "");
        }
      }
    }
  }

  // Try Pattern 3 (direct JSON after tool name)
  if (toolCalls.length === 0) {
    while ((match = directJsonPattern.exec(cleaned)) !== null) {
      const toolName = findToolName(match[1], availableToolNames);
      if (!toolName) continue;
      try {
        const input = JSON.parse(match[2]);
        toolCalls.push({
          type: "tool_use",
          id: `txt-${randomShortId()}`,
          name: toolName,
          input,
        });
        remainingText = remainingText.replace(match[0], "");
      } catch {
        // Skip
      }
    }
  }

  // Try Pattern 4 (XML-style tool_call tags)
  if (toolCalls.length === 0) {
    while ((match = xmlPattern.exec(cleaned)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const name = parsed.name || parsed.function?.name;
        const args =
          parsed.arguments || parsed.function?.arguments || parsed.params || {};
        const toolName = findToolName(name, availableToolNames);
        if (toolName) {
          const input =
            typeof args === "string" ? JSON.parse(args) : args;
          toolCalls.push({
            type: "tool_use",
            id: `txt-${randomShortId()}`,
            name: toolName,
            input,
          });
          remainingText = remainingText.replace(match[0], "");
        }
      } catch {
        // Skip
      }
    }
  }

  if (toolCalls.length === 0) return null;

  // Clean up remaining text: remove stray non-ASCII tool-call artifacts
  remainingText = remainingText
    .replace(/[^\x00-\x7F]+(?:call:)?/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { toolCalls, cleanedText: remainingText };
}

/** Case-insensitive tool name matching */
function findToolName(
  candidate: string,
  availableNames: string[]
): string | null {
  if (!candidate) return null;
  const lower = candidate.toLowerCase().trim();
  return availableNames.find((n) => n.toLowerCase() === lower) || null;
}

/** Parse key:value pairs or JSON from tool call text */
function parseToolParams(str: string): Record<string, unknown> | null {
  if (!str || !str.trim()) return null;

  // Try as valid JSON first
  try {
    return JSON.parse(`{${str}}`);
  } catch {
    // Continue to key:value parsing
  }

  // Try as key:value pairs (e.g. "path:main.tex,mode:overwrite")
  try {
    const result: Record<string, unknown> = {};
    // Split by comma, but not inside quotes or braces
    const pairs = str.split(/,(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/);
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx === -1) continue;
      const key = pair
        .slice(0, colonIdx)
        .trim()
        .replace(/^["']|["']$/g, "");
      let value: unknown = pair
        .slice(colonIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      // Parse booleans and numbers
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (typeof value === "string" && !isNaN(Number(value)) && value !== "")
        value = Number(value);
      if (key) result[key] = value;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function randomShortId(): string {
  // Use "call_" prefix for OpenAI-compatible format
  return "call_" + Math.random().toString(36).slice(2, 12);
}

/** Convert API error messages into user-friendly Portuguese messages */
function getFriendlyError(errorMsg: string, providerType: string): string {
  // Credit/billing errors
  if (errorMsg.includes("402") || errorMsg.includes("credits") || errorMsg.includes("billing") || errorMsg.includes("insufficient")) {
    return `Seus créditos de IA acabaram. Acesse as configurações do seu provedor (${providerType}) para adicionar créditos.\n\nErro original: ${errorMsg}`;
  }
  // Rate limiting
  if (errorMsg.includes("429") || errorMsg.includes("rate limit") || errorMsg.includes("too many requests")) {
    return `Muitas requisições. Aguarde alguns segundos e tente novamente.\n\nErro original: ${errorMsg}`;
  }
  // Auth errors
  if (errorMsg.includes("401") || errorMsg.includes("unauthorized") || errorMsg.includes("invalid.*key")) {
    return `Chave de API inválida ou expirada. Verifique em Configurações.\n\nErro original: ${errorMsg}`;
  }
  // Model not found
  if (errorMsg.includes("404") || errorMsg.includes("model not found") || errorMsg.includes("does not exist")) {
    return `Modelo de IA não encontrado. Verifique a configuração do modelo em Configurações.\n\nErro original: ${errorMsg}`;
  }
  // Context too long
  if (errorMsg.includes("context") || errorMsg.includes("token") && errorMsg.includes("exceed")) {
    return `O contexto ficou muito longo. Tente simplificar o pedido ou iniciar uma nova conversa.\n\nErro original: ${errorMsg}`;
  }
  // Overloaded
  if (errorMsg.includes("529") || errorMsg.includes("overloaded")) {
    return `O provedor de IA está sobrecarregado. Tente novamente em alguns minutos.\n\nErro original: ${errorMsg}`;
  }
  return errorMsg;
}
