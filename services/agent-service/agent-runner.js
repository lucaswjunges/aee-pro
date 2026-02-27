import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import fs from "node:fs";
import {
  extractFiles,
  recordMtimes,
  collectChangedFiles,
  cleanupWorkspace,
} from "./file-utils.js";
import { createAEEMcpServer } from "./mcp-tools.js";

/**
 * Run the Claude Agent SDK for a Pro Max request.
 *
 * Flow:
 * 1. Extract project files into /tmp/workspace/{sessionId}/
 * 2. Create MCP server with AEE tools (compile_latex, get_student_data, get_prompt_template)
 * 3. Run query() with streaming — map SDK messages to SSE events
 * 4. Track modified files via PostToolUse hooks
 * 5. Emit files_sync event at the end with changed files
 *
 * @param {object} opts
 * @param {Array} opts.files - packed project files
 * @param {string} opts.systemPrompt
 * @param {Array<{role: string, content: string}>} opts.messages - conversation history
 * @param {string|null} opts.studentData
 * @param {Record<string,string>} opts.promptTemplates
 * @param {string} opts.projectId
 * @param {number} opts.maxTurns
 * @param {number} opts.maxThinkingTokens
 * @param {(data: object) => void} opts.sendSSE
 */
export async function runAgent(opts) {
  const {
    files,
    systemPrompt,
    messages,
    studentData,
    promptTemplates,
    proMaxEnhancements,
    projectId,
    maxTurns,
    maxThinkingTokens,
    sendSSE,
  } = opts;

  // Generate unique session ID
  const sessionId = `${projectId}-${Date.now()}`;

  // 1. Extract files to local filesystem
  console.log(`[agent] Extracting ${files.length} files for session ${sessionId}`);
  const workDir = extractFiles(sessionId, files);
  const originalMtimes = recordMtimes(workDir, files);

  // Track files touched by the agent
  const touchedPaths = new Set();

  // 2. Create MCP server with AEE tools
  const mcpServer = createAEEMcpServer({
    workDir,
    studentData,
    promptTemplates,
    proMaxEnhancements: proMaxEnhancements || {},
  });

  // 3. Build the prompt from messages
  // Last message is the user's current message
  const lastUserMsg = messages.length > 0
    ? messages[messages.length - 1]
    : null;

  const prompt = lastUserMsg?.content || "Olá";

  // Build conversation context from prior messages (skip the last one which is the prompt)
  const priorMessages = messages.slice(0, -1);
  let contextBlock = "";
  if (priorMessages.length > 0) {
    contextBlock = "\n\n--- Histórico da conversa ---\n" +
      priorMessages.map((m) =>
        `${m.role === "user" ? "Professora" : "Assistente"}: ${m.content}`
      ).join("\n") +
      "\n--- Fim do histórico ---\n";
  }

  // Adapt tool names: the Worker system prompt references custom tools (write_file, read_file, etc.)
  // but the Agent SDK uses built-in tools (Write, Read, Edit, Bash, Glob, Grep) + MCP tools.
  const adaptedPrompt = adaptToolNames(systemPrompt);
  const fullSystemPrompt = adaptedPrompt + contextBlock;

  // 4. Run the Agent SDK query
  const model = process.env.AGENT_MODEL || "claude-sonnet-4-6";
  console.log(`[agent] Starting query() — model: ${model}, maxTurns: ${maxTurns}`);

  try {
    const agentQuery = query({
      prompt,
      options: {
        model,
        systemPrompt: fullSystemPrompt,
        cwd: workDir,
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns,
        maxThinkingTokens: Math.max(maxThinkingTokens, 1024),
        maxBudgetUsd: 5.0,
        includePartialMessages: true,
        mcpServers: {
          "aee-tools": mcpServer,
        },
        hooks: {
          PostToolUse: [
            {
              matcher: "Write",
              hooks: [
                async (input) => {
                  // Track files written by the agent
                  if (input.tool_input?.file_path) {
                    const rel = path.relative(workDir, input.tool_input.file_path);
                    if (!rel.startsWith("..")) {
                      touchedPaths.add(rel);
                    }
                  }
                  return {};
                },
              ],
            },
            {
              matcher: "Edit",
              hooks: [
                async (input) => {
                  if (input.tool_input?.file_path) {
                    const rel = path.relative(workDir, input.tool_input.file_path);
                    if (!rel.startsWith("..")) {
                      touchedPaths.add(rel);
                    }
                  }
                  return {};
                },
              ],
            },
            {
              matcher: "Bash",
              hooks: [
                async (input) => {
                  // Track any files created by Bash (best-effort via output parsing)
                  // Also track pdflatex outputs
                  const cmd = input.tool_input?.command || "";
                  if (cmd.includes("pdflatex")) {
                    // Track output PDF
                    const texMatch = cmd.match(/([^\s"]+\.tex)/);
                    if (texMatch) {
                      const pdfName = texMatch[1].replace(/\.tex$/, ".pdf");
                      touchedPaths.add(pdfName);
                      touchedPaths.add(`output/${path.basename(pdfName)}`);
                    }
                  }
                  return {};
                },
              ],
            },
            {
              // Track MCP tool compile_latex output
              matcher: "mcp__aee-tools__compile_latex",
              hooks: [
                async (input) => {
                  const texPath = input.tool_input?.path;
                  if (texPath) {
                    const pdfName = texPath.replace(/\.tex$/, ".pdf");
                    touchedPaths.add(`output/${pdfName}`);
                    touchedPaths.add(texPath); // The .tex may have been modified by fixers
                  }
                  return {};
                },
              ],
            },
          ],
        },
      },
    });

    // 5. Stream messages as SSE events
    let totalCostUsd = 0;
    let streamedTextLength = 0; // Track how much text was streamed token-by-token in current turn
    let totalTextEmitted = 0;   // Track total text ever emitted (never resets)

    for await (const message of agentQuery) {
      switch (message.type) {
        case "stream_event": {
          // Partial streaming events (token-by-token)
          const event = message.event;

          if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && event.delta.text) {
              sendSSE({ type: "text", content: event.delta.text });
              streamedTextLength += event.delta.text.length;
              totalTextEmitted += event.delta.text.length;
            } else if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
              sendSSE({ type: "thinking", content: event.delta.thinking });
            }
          }
          break;
        }

        case "assistant": {
          // Complete assistant message — extract tool_use and text blocks
          const content = message.message?.content;
          if (!content) break;

          for (const block of content) {
            if (block.type === "tool_use") {
              sendSSE({
                type: "tool_call",
                tool: block.name,
                toolInput: block.input,
              });
            } else if (block.type === "text" && block.text) {
              // If text wasn't already streamed via stream_event, send it now
              if (block.text.length > streamedTextLength) {
                const unsent = block.text.slice(streamedTextLength);
                if (unsent) {
                  sendSSE({ type: "text", content: unsent });
                  totalTextEmitted += unsent.length;
                }
              }
              // Reset per-turn counter — next assistant message starts fresh
              streamedTextLength = 0;
            }
          }
          break;
        }

        case "user": {
          // Tool results from the agent loop
          const content = message.message?.content;
          if (!content) break;

          for (const block of content) {
            if (block.type === "tool_result") {
              const resultText = Array.isArray(block.content)
                ? block.content.map((c) => c.text || "").join("\n")
                : typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content);

              sendSSE({
                type: "tool_result",
                tool: block.tool_use_id,
                result: resultText.length > 2000
                  ? resultText.slice(0, 2000) + "..."
                  : resultText,
              });
            }
          }
          break;
        }

        case "result": {
          totalCostUsd = message.total_cost_usd || 0;

          if (message.subtype === "success") {
            console.log(`[agent] Completed successfully. Cost: $${totalCostUsd.toFixed(4)}, turns: ${message.num_turns}`);
            // Fallback: if no text was ever streamed, emit the result text
            if (message.result && totalTextEmitted === 0) {
              sendSSE({ type: "text", content: message.result });
            }
          } else {
            console.log(`[agent] Ended with: ${message.subtype}. Cost: $${totalCostUsd.toFixed(4)}`);
            if (message.errors?.length) {
              sendSSE({ type: "error", content: message.errors.join("\n") });
            }
          }
          break;
        }

        case "system": {
          // Initialization message — log but don't send to frontend
          if (message.subtype === "init") {
            console.log(`[agent] SDK initialized: model=${message.model}, tools=${message.tools?.length}`);
          }
          break;
        }
      }
    }

    // 6. Collect changed files and emit files_sync
    console.log(`[agent] Collecting changed files. Tracked ${touchedPaths.size} paths.`);

    // Also scan output/ directory for generated PDFs
    const outputDir = path.join(workDir, "output");
    if (fs.existsSync(outputDir)) {
      for (const entry of fs.readdirSync(outputDir)) {
        touchedPaths.add(`output/${entry}`);
      }
    }

    const changedFiles = collectChangedFiles(workDir, originalMtimes, touchedPaths);
    console.log(`[agent] ${changedFiles.length} file(s) changed.`);

    if (changedFiles.length > 0) {
      sendSSE({
        type: "files_sync",
        files: changedFiles,
      });
    }

    // 7. Send done event
    sendSSE({
      type: "done",
      cost: totalCostUsd,
      turns: 0, // Will be filled from result
    });

    // Cleanup
    cleanupWorkspace(workDir);

  } catch (err) {
    console.error(`[agent] Error:`, err);
    cleanupWorkspace(workDir);
    throw err;
  }
}
