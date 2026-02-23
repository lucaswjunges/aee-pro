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
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
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

/**
 * Runs the agentic loop, yielding SSE events.
 * The loop calls the AI, executes tools, and continues until the AI stops or max iterations.
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
  });

  const messages: ClaudeMessage[] = [...opts.messages];

  for (let iteration = 0; iteration < maxIter; iteration++) {
    // Call the AI provider
    let response: {
      content: ClaudeContentBlock[];
      stop_reason: string;
    };

    try {
      response = await callClaudeWithTools(
        opts.apiKey,
        opts.providerType,
        opts.model,
        systemPrompt,
        messages,
        tools
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: msg };
      return;
    }

    // Process response blocks
    const toolUseBlocks: ClaudeContentBlock[] = [];
    let hasText = false;

    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        hasText = true;
        yield { type: "text", content: block.text };
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0) {
      yield { type: "done" };
      return;
    }

    // Add assistant message to history
    messages.push({ role: "assistant", content: response.content });

    // Execute tools
    const toolResults: ClaudeContentBlock[] = [];

    for (const toolBlock of toolUseBlocks) {
      const toolName = toolBlock.name!;
      const toolInput = toolBlock.input!;

      yield {
        type: "tool_call",
        tool: toolName,
        toolInput,
      };

      // Handle spawn_agent specially
      if (toolName === "spawn_agent") {
        const agentId = crypto.randomUUID().slice(0, 8);
        yield {
          type: "agent_spawn",
          agentId,
          agentTask: toolInput.task as string,
        };

        // Run sub-agent (simplified: single iteration with same context)
        const subResult = await runSubAgent(
          toolInput.task as string,
          toolInput.context as string | undefined,
          opts
        );

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
      } else {
        // Execute normal tool
        const result = await executeTool(toolName, toolInput, opts.toolCtx);

        yield {
          type: "tool_result",
          tool: toolName,
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

    // Add tool results to history
    messages.push({ role: "user", content: toolResults });

    // If AI said end_turn, stop
    if (response.stop_reason === "end_turn") {
      yield { type: "done" };
      return;
    }

    // Signal that AI is processing (next API call may take 10-30s)
    yield { type: "thinking" };
  }

  yield {
    type: "text",
    content: "\n\n(Limite de iterações atingido. Peça para continuar se necessário.)",
  };
  yield { type: "done" };
}

/**
 * Run a sub-agent for a specific task.
 * Returns the concatenated text output.
 */
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

/**
 * Call Claude API with tool definitions.
 * Supports Anthropic (native) and OpenAI-compatible providers.
 */
async function callClaudeWithTools(
  apiKey: string,
  providerType: string,
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<{
  content: ClaudeContentBlock[];
  stop_reason: string;
}> {
  if (providerType === "anthropic") {
    return callAnthropicWithTools(apiKey, model, systemPrompt, messages, tools);
  }

  // For OpenAI-compatible providers, use the OpenAI tool format
  return callOpenAICompatibleWithTools(
    apiKey,
    providerType,
    model,
    systemPrompt,
    messages,
    tools
  );
}

async function callAnthropicWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<{
  content: ClaudeContentBlock[];
  stop_reason: string;
}> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    content: ClaudeContentBlock[];
    stop_reason: string;
  };

  return data;
}

async function callOpenAICompatibleWithTools(
  apiKey: string,
  providerType: string,
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ToolDefinition[]
): Promise<{
  content: ClaudeContentBlock[];
  stop_reason: string;
}> {
  // Map provider to endpoint
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
      // Convert Claude tool_result blocks to OpenAI format
      const textParts = m.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const toolResultParts = m.content.filter((b) => b.type === "tool_result");

      if (toolResultParts.length > 0) {
        return toolResultParts.map((tr) => ({
          role: "tool" as const,
          tool_call_id: tr.tool_use_id,
          content: tr.content || "",
        }));
      }

      // Convert Claude tool_use blocks to OpenAI assistant message with tool_calls
      const toolUseParts = m.content.filter((b) => b.type === "tool_use");
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

  // Convert tools to OpenAI format
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

  // Gemini uses API key differently
  if (providerType === "gemini") {
    headers["x-goog-api-key"] = apiKey;
    delete headers["Authorization"];
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: openaiMessages,
      tools: openaiTools,
      max_tokens: 16000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${providerType} API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
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

  // Convert back to Claude format
  const content: ClaudeContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    }
  }

  const stopReason =
    choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

  return { content, stop_reason: stopReason };
}
