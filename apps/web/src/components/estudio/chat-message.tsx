import { useState, useCallback } from "react";
import {
  Bot,
  User,
  Wrench,
  AlertTriangle,
  GitBranch,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FileEdit,
  FolderOpen,
  Search,
  Trash2,
  Database,
  Cpu,
  BookOpen,
  Undo2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Raw SSE event as sent by the agent loop */
interface RawSSEEvent {
  type: string;
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: { success?: boolean; output?: string; error?: string; filePath?: string; fileId?: string; versionId?: string; oldText?: string; newText?: string };
  agentId?: string;
  agentTask?: string;
}

interface ChatMessageProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: RawSSEEvent[];
  isStreaming?: boolean;
  isThinking?: boolean;
  /** True only for the currently-streaming message (tools may still be in-flight) */
  liveStreaming?: boolean;
  /** When false, file-modifying tools show review UI with Accept/Undo */
  autoAccept?: boolean;
  /** Callback to undo a file modification by restoring a previous version */
  onUndoFile?: (fileId: string, versionId: string) => Promise<void>;
  /** Callback to delete this message */
  onDelete?: (id: string) => void;
  /** Callback to regenerate this assistant message */
  onRegenerate?: (id: string) => void;
  /** Whether any message is currently streaming (disables actions) */
  globalStreaming?: boolean;
}

export function ChatMessage({
  id,
  role,
  content,
  toolCalls,
  isStreaming,
  isThinking,
  liveStreaming,
  autoAccept,
  onUndoFile,
  onDelete,
  onRegenerate,
  globalStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Group tool_call + tool_result pairs.
  // For stored/finalized messages (not live streaming), force all pairs as completed
  // to avoid showing "Executando..." on old messages that may lack tool_result events.
  const toolPairs = groupToolEvents(toolCalls || [], !liveStreaming);

  // Messages loaded from history default to accepted (no review buttons)
  const isFromHistory = !liveStreaming && !isStreaming;

  // Show action buttons only on finalized messages (not streaming)
  const showActions = id && !liveStreaming && !isStreaming && !globalStreaming;

  return (
    <div
      className={cn(
        "group/msg flex gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 space-y-2",
          isUser ? "items-end flex flex-col" : "items-start flex flex-col"
        )}
      >
        {/* Text content with markdown */}
        {content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm max-w-[85%] leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground rounded-tr-md"
                : "bg-muted/70 text-foreground rounded-tl-md"
            )}
          >
            <MarkdownContent text={content} isUser={isUser} />
          </div>
        )}

        {/* Tool calls (after text content) */}
        {toolPairs.length > 0 && (
          <ToolCallGroup
            pairs={toolPairs}
            rawEvents={toolCalls}
            autoAccept={autoAccept}
            onUndoFile={onUndoFile}
            isFromHistory={isFromHistory}
          />
        )}

        {/* Thinking indicator (AI processing after tool results) */}
        {isThinking && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-violet-600 dark:text-violet-400">
            <span className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <span className="font-medium">Analisando resultados...</span>
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-1.5 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-bounce" />
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-bounce [animation-delay:0.15s]" />
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-bounce [animation-delay:0.3s]" />
          </div>
        )}

        {/* Action buttons (visible on hover) */}
        {showActions && (
          <div
            className={cn(
              "flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity",
              isUser ? "flex-row-reverse" : "flex-row"
            )}
          >
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Apagar?</span>
                <button
                  onClick={() => {
                    onDelete?.(id);
                    setConfirmDelete(false);
                  }}
                  className="px-1.5 py-0.5 rounded text-red-600 dark:text-red-400 hover:bg-red-500/15 font-medium"
                >
                  Sim
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted font-medium"
                >
                  Não
                </button>
              </div>
            ) : (
              <>
                {/* Regenerate — assistant only */}
                {!isUser && onRegenerate && (
                  <button
                    onClick={() => onRegenerate(id)}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                    title="Regenerar resposta"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Delete */}
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title={isUser ? "Apagar mensagem e resposta" : "Apagar mensagem"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────── Tool call pairing and display ───────────

interface ToolPair {
  type: "tool" | "agent";
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: { success?: boolean; output?: string; error?: string; filePath?: string; fileId?: string; versionId?: string; oldText?: string; newText?: string };
  agentTask?: string;
  agentResult?: string;
  completed: boolean;
}

function groupToolEvents(events: RawSSEEvent[], forceComplete = false): ToolPair[] {
  const pairs: ToolPair[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];

    if (ev.type === "tool_call") {
      const pair: ToolPair = {
        type: "tool",
        tool: ev.tool || ev.content || "",
        toolInput: ev.toolInput,
        completed: false,
      };
      // Look for matching tool_result
      if (i + 1 < events.length && events[i + 1].type === "tool_result") {
        pair.result = events[i + 1].result as ToolPair["result"];
        if (!pair.result && events[i + 1].content) {
          // Fallback: old format where result is in content
          const isError = events[i + 1].content?.startsWith("ERRO:");
          pair.result = {
            success: !isError,
            output: events[i + 1].content,
            error: isError ? events[i + 1].content : undefined,
          };
        }
        pair.completed = true;
        i += 2;
      } else {
        i += 1;
      }
      pairs.push(pair);
    } else if (ev.type === "agent_spawn") {
      const pair: ToolPair = {
        type: "agent",
        agentTask: ev.agentTask,
        completed: false,
      };
      if (i + 1 < events.length && events[i + 1].type === "agent_result") {
        pair.agentResult = events[i + 1].content;
        pair.completed = true;
        i += 2;
      } else {
        i += 1;
      }
      pairs.push(pair);
    } else if (ev.type === "tool_result") {
      // Orphan tool_result (shouldn't happen, but handle gracefully)
      pairs.push({
        type: "tool",
        tool: ev.tool || "",
        result: ev.result as ToolPair["result"],
        completed: true,
      });
      i += 1;
    } else {
      i += 1;
    }
  }

  // For stored/finalized messages, force all incomplete pairs as completed
  if (forceComplete) {
    for (const p of pairs) p.completed = true;
  }

  return pairs;
}

function ToolCallGroup({ pairs, rawEvents, autoAccept, onUndoFile, isFromHistory }: { pairs: ToolPair[]; rawEvents?: RawSSEEvent[]; autoAccept?: boolean; onUndoFile?: (fileId: string, versionId: string) => Promise<void>; isFromHistory?: boolean }) {
  // Auto-expand when reviewing edits (autoAccept off, has file-modifying tools)
  const hasReviewableTools = !autoAccept && pairs.some(
    (p) => p.type === "tool" && ["write_file", "edit_file", "delete_file"].includes(p.tool || "") && p.result?.versionId
  );
  const [expanded, setExpanded] = useState(hasReviewableTools && !isFromHistory);
  const [copied, setCopied] = useState(false);
  const completedCount = pairs.filter((p) => p.completed).length;
  // If ANY compile_latex succeeded → green (even if earlier attempts failed, the goal was achieved)
  const hasCompileSuccess = pairs.some(
    (p) => p.tool === "compile_latex" && p.result?.success
  );
  const hasErrors = !hasCompileSuccess && pairs.some((p) => p.result && !p.result.success);
  const allDone = completedCount === pairs.length && pairs.length > 0;

  // Build hover tooltip summarizing all tool operations
  const tooltipLines = pairs.map((p) => {
    if (p.type === "agent") {
      const status = p.completed ? "concluído" : "executando...";
      return `Sub-agente: ${p.agentTask || "tarefa"} (${status})`;
    }
    const name = toolDisplayName(p.tool || "");
    const detail = getToolDetail(p.tool || "", p.toolInput);
    const status = !p.completed
      ? "executando..."
      : p.result?.success === false
        ? "ERRO"
        : "concluído";
    return `${name}${detail ? ` — ${detail}` : ""} (${status})`;
  });
  const tooltipText = tooltipLines.join("\n");

  return (
    <div className="w-full max-w-[85%]">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        title={tooltipText}
        className={cn(
          "flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 w-full transition-colors",
          hasErrors
            ? "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/15"
            : allDone
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
        )}
      >
        {allDone ? (
          hasErrors ? (
            <span className="text-current flex-shrink-0 text-xs font-bold leading-none">!</span>
          ) : (
            <span className="text-current flex-shrink-0 text-xs font-bold leading-none">✓</span>
          )
        ) : (
          <Wrench className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
        )}
        <span className="flex-1 text-left font-medium">
          {allDone
            ? `${completedCount} ${completedCount === 1 ? "ação executada" : "ações executadas"}`
            : `Executando... (${completedCount}/${pairs.length})`}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail list */}
      {expanded && (
        <>
          <div className="mt-1 rounded-lg border bg-muted/30 divide-y divide-border/50 overflow-hidden">
            {pairs.map((pair, i) => (
              <ToolCallDetail
                key={i}
                pair={pair}
                autoAccept={autoAccept}
                onUndoFile={onUndoFile}
                isFromHistory={isFromHistory}
              />
            ))}
          </div>
          {/* Copyable plain-text log */}
          <ToolCallLog rawEvents={rawEvents} pairs={pairs} copied={copied} onCopy={() => {
            const text = buildToolLogText(rawEvents, pairs);
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }} />
        </>
      )}
    </div>
  );
}

function ToolCallDetail({ pair, autoAccept, onUndoFile, isFromHistory }: { pair: ToolPair; autoAccept?: boolean; onUndoFile?: (fileId: string, versionId: string) => Promise<void>; isFromHistory?: boolean }) {
  const [showResult, setShowResult] = useState(false);

  // Review state for file-modifying tools
  const isFileModifying = ["write_file", "edit_file", "delete_file"].includes(pair.tool || "");
  const canReview = !autoAccept && isFileModifying && pair.result?.versionId && pair.result?.fileId;
  // Messages from history default to "accepted"
  const [reviewState, setReviewState] = useState<"pending" | "accepted" | "undone">(
    isFromHistory || autoAccept ? "accepted" : "pending"
  );
  const [isUndoing, setIsUndoing] = useState(false);

  const handleAccept = useCallback(() => {
    setReviewState("accepted");
  }, []);

  const handleUndo = useCallback(async () => {
    if (!onUndoFile || !pair.result?.fileId || !pair.result?.versionId) return;
    setIsUndoing(true);
    try {
      await onUndoFile(pair.result.fileId, pair.result.versionId);
      setReviewState("undone");
    } catch {
      // Keep as pending if undo fails
    } finally {
      setIsUndoing(false);
    }
  }, [onUndoFile, pair.result?.fileId, pair.result?.versionId]);

  if (pair.type === "agent") {
    return (
      <div className="px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          {pair.completed ? (
            <Check className="h-3 w-3 text-blue-500 flex-shrink-0" />
          ) : (
            <GitBranch className="h-3 w-3 text-blue-500 animate-pulse flex-shrink-0" />
          )}
          <span className="text-blue-600 dark:text-blue-400 font-medium">Sub-agente</span>
          <span className="text-muted-foreground truncate">{pair.agentTask}</span>
        </div>
      </div>
    );
  }

  const Icon = getToolIcon(pair.tool || "");
  const label = toolDisplayName(pair.tool || "");
  const detail = getToolDetail(pair.tool || "", pair.toolInput);
  const isError = pair.result && !pair.result.success;
  const resultText = pair.result?.output || pair.result?.error || "";

  // Build hover tooltip for this specific tool call
  const hoverLines: string[] = [`${label}${detail ? `: ${detail}` : ""}`];
  if (pair.toolInput) {
    const inputKeys = Object.entries(pair.toolInput)
      .filter(([, v]) => v != null && String(v).length < 100)
      .map(([k, v]) => `  ${k}: ${String(v).slice(0, 80)}`);
    if (inputKeys.length > 0) hoverLines.push("Entrada:", ...inputKeys);
  }
  if (pair.completed) {
    hoverLines.push(
      isError
        ? `Resultado: ERRO — ${(resultText || "").slice(0, 120)}`
        : `Resultado: OK${resultText ? ` — ${resultText.slice(0, 120)}` : ""}`
    );
  } else {
    hoverLines.push("Status: executando...");
  }
  const hoverTitle = hoverLines.join("\n");

  // Should we show the review panel?
  const showReviewPanel = canReview && pair.completed && reviewState === "pending";

  return (
    <div className="px-3 py-2 text-xs">
      <button
        onClick={() => pair.completed && !showReviewPanel && setShowResult(!showResult)}
        title={hoverTitle}
        className="flex items-center gap-2 w-full text-left"
      >
        {/* Status indicator — text chars so they're copyable via select-all */}
        {canReview && reviewState === "undone" ? (
          <span className="text-amber-500 flex-shrink-0 text-xs font-bold leading-none">✗</span>
        ) : canReview && reviewState === "accepted" ? (
          <span className="text-emerald-500 flex-shrink-0 text-xs font-bold leading-none">✓</span>
        ) : pair.completed ? (
          isError ? (
            <span className="text-red-500 flex-shrink-0 text-xs font-bold leading-none">!</span>
          ) : (
            <span className="text-emerald-500 flex-shrink-0 text-xs font-bold leading-none">✓</span>
          )
        ) : (
          <Icon className="h-3 w-3 text-amber-500 animate-spin flex-shrink-0" />
        )}
        <span className={cn(
          "font-medium",
          isError ? "text-red-600 dark:text-red-400"
            : reviewState === "undone" ? "text-amber-600 dark:text-amber-400 line-through"
            : "text-foreground"
        )}>
          {label}
        </span>
        {detail && (
          <span className="text-muted-foreground truncate flex-1">{detail}</span>
        )}
        {/* Compact result summary — useful context when copy-pasting */}
        {pair.completed && resultText && (
          <span className={cn(
            "text-[10px] truncate max-w-[200px] flex-shrink",
            isError ? "text-red-400/70" : "text-emerald-600/50 dark:text-emerald-400/50"
          )}>
            {isError
              ? `→ ${resultText.slice(0, 80)}`
              : resultText.length > 60
                ? `→ ${resultText.slice(0, 60)}…`
                : `→ ${resultText}`
            }
          </span>
        )}
        {/* Review state badges */}
        {canReview && reviewState === "accepted" && !isFromHistory && (
          <span className="text-emerald-600 dark:text-emerald-400 text-[10px] flex-shrink-0 font-medium">aceito</span>
        )}
        {canReview && reviewState === "undone" && (
          <span className="text-amber-600 dark:text-amber-400 text-[10px] flex-shrink-0 font-medium">(desfeito)</span>
        )}
        {!canReview && pair.completed && pair.result?.filePath && (
          <span className="text-muted-foreground/70 text-[10px] flex-shrink-0">
            {pair.result.filePath}
          </span>
        )}
      </button>

      {/* Review panel (when autoAccept is off and state is pending) */}
      {showReviewPanel && (
        <div className="mt-2 rounded-lg border bg-muted/20 p-2.5 space-y-2">
          {/* Inline diff for edit_file */}
          {pair.tool === "edit_file" && pair.result?.oldText && pair.result?.newText && (
            <InlineDiff oldText={pair.result.oldText} newText={pair.result.newText} />
          )}
          {/* Info for write_file */}
          {pair.tool === "write_file" && (
            <div className="text-[11px] text-muted-foreground">
              {resultText}
            </div>
          )}
          {/* Info for delete_file */}
          {pair.tool === "delete_file" && (
            <div className="text-[11px] text-red-600 dark:text-red-400">
              Arquivo removido: {pair.result?.filePath}
            </div>
          )}
          {/* Accept / Undo buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            >
              <Check className="h-3 w-3" />
              Aceitar
            </button>
            <button
              onClick={handleUndo}
              disabled={isUndoing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              <Undo2 className="h-3 w-3" />
              {isUndoing ? "Desfazendo..." : "Desfazer"}
            </button>
          </div>
        </div>
      )}

      {/* Expandable result (regular mode) */}
      {showResult && resultText && !showReviewPanel && (
        <div className={cn(
          "mt-1.5 rounded px-2.5 py-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto",
          isError
            ? "bg-red-500/10 text-red-700 dark:text-red-300"
            : "bg-emerald-500/5 text-muted-foreground"
        )}>
          {resultText.length > 500 ? resultText.slice(0, 500) + "..." : resultText}
        </div>
      )}
    </div>
  );
}

// ─────────── Copyable tool log ───────────

/** Build a plain-text log of all tool events for copy-paste */
function buildToolLogText(rawEvents?: RawSSEEvent[], pairs?: ToolPair[]): string {
  // Prefer raw events for full fidelity; fall back to pairs
  if (rawEvents && rawEvents.length > 0) {
    const lines: string[] = [];
    for (const ev of rawEvents) {
      if (ev.type === "tool_call") {
        const inputSummary = ev.toolInput
          ? Object.entries(ev.toolInput)
              .map(([k, v]) => {
                const val = typeof v === "string" ? v : JSON.stringify(v);
                // Truncate large values (content, old_text, new_text) to keep log readable
                const truncated = val.length > 200 ? val.slice(0, 200) + "…" : val;
                return `${k}: ${truncated}`;
              })
              .join(", ")
          : "";
        lines.push(`[tool_call] ${ev.tool}(${inputSummary})`);
      } else if (ev.type === "tool_result") {
        const res = ev.result;
        if (res && typeof res === "object") {
          const r = res as Record<string, unknown>;
          const ok = r.success !== false;
          const text = (r.output || r.error || "") as string;
          const truncated = text.length > 300 ? text.slice(0, 300) + "…" : text;
          lines.push(`[tool_result] ${ev.tool} → ${ok ? "OK" : "ERRO"}: ${truncated}`);
        } else {
          lines.push(`[tool_result] ${ev.tool} → ${ev.content || "(sem resultado)"}`);
        }
      } else if (ev.type === "agent_spawn") {
        lines.push(`[agent_spawn] ${ev.agentTask || "tarefa"} (id: ${ev.agentId || "?"})`);
      } else if (ev.type === "agent_result") {
        const text = ev.content || "";
        const truncated = text.length > 300 ? text.slice(0, 300) + "…" : text;
        lines.push(`[agent_result] ${ev.agentId || "?"}: ${truncated}`);
      }
    }
    return lines.join("\n");
  }
  // Fallback: build from pairs
  if (pairs) {
    return pairs.map((p) => {
      if (p.type === "agent") {
        return `[agent] ${p.agentTask || "tarefa"} → ${p.agentResult ? p.agentResult.slice(0, 200) : "(sem resultado)"}`;
      }
      const detail = getToolDetail(p.tool || "", p.toolInput);
      const status = !p.completed ? "executando..." : p.result?.success === false ? `ERRO: ${p.result.error || ""}` : `OK: ${(p.result?.output || "").slice(0, 200)}`;
      return `[${p.tool}] ${detail} → ${status}`;
    }).join("\n");
  }
  return "(sem dados)";
}

function ToolCallLog({ rawEvents, pairs, copied, onCopy }: { rawEvents?: RawSSEEvent[]; pairs: ToolPair[]; copied: boolean; onCopy: () => void }) {
  const logText = buildToolLogText(rawEvents, pairs);
  return (
    <div className="mt-1 relative group/log">
      <button
        onClick={onCopy}
        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors z-10"
        title="Copiar log"
      >
        {copied ? <ClipboardCheck className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
      <pre className="rounded-lg border bg-zinc-950 dark:bg-zinc-950 text-zinc-300 px-3 py-2 text-[10px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed select-text">
        {logText}
      </pre>
    </div>
  );
}

// ─────────── Inline diff component ───────────

function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const [showFull, setShowFull] = useState(false);
  const maxLines = 15;

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const needsTruncation = !showFull && (oldLines.length > maxLines || newLines.length > maxLines);
  const displayOld = needsTruncation ? oldLines.slice(0, maxLines).join("\n") : oldText;
  const displayNew = needsTruncation ? newLines.slice(0, maxLines).join("\n") : newText;

  return (
    <div className="rounded border bg-background text-[11px] font-mono overflow-hidden">
      {/* Removed lines */}
      <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200/50 dark:border-red-800/30 px-2.5 py-1.5 whitespace-pre-wrap break-all text-red-800 dark:text-red-300 line-through max-h-40 overflow-y-auto">
        {displayOld}
      </div>
      {/* Added lines */}
      <div className="bg-green-50 dark:bg-green-900/20 px-2.5 py-1.5 whitespace-pre-wrap break-all text-green-800 dark:text-green-300 max-h-40 overflow-y-auto">
        {displayNew}
      </div>
      {needsTruncation && (
        <button
          onClick={() => setShowFull(true)}
          className="w-full text-center py-1 text-[10px] text-muted-foreground hover:text-foreground bg-muted/30 border-t transition-colors"
        >
          ver mais ({oldLines.length + newLines.length} linhas)
        </button>
      )}
    </div>
  );
}

function getToolIcon(tool: string) {
  const icons: Record<string, typeof Wrench> = {
    read_file: FileText,
    write_file: FileEdit,
    edit_file: FileEdit,
    list_files: FolderOpen,
    delete_file: Trash2,
    rename_file: FileEdit,
    search_files: Search,
    compile_latex: Cpu,
    get_student_data: Database,
    get_prompt_template: BookOpen,
  };
  return icons[tool] || Wrench;
}

function toolDisplayName(tool: string): string {
  const names: Record<string, string> = {
    read_file: "Lendo arquivo",
    write_file: "Escrevendo arquivo",
    edit_file: "Editando arquivo",
    list_files: "Listando arquivos",
    delete_file: "Removendo arquivo",
    rename_file: "Renomeando arquivo",
    search_files: "Buscando nos arquivos",
    compile_latex: "Compilando LaTeX",
    get_student_data: "Buscando dados do aluno",
    get_prompt_template: "Carregando template",
    spawn_agent: "Iniciando sub-agente",
  };
  return names[tool] || tool || "Executando";
}

function getToolDetail(tool: string, input?: Record<string, unknown>): string {
  if (!input) return "";

  switch (tool) {
    case "read_file":
    case "write_file":
    case "edit_file":
    case "delete_file":
    case "compile_latex":
      return input.path ? String(input.path) : "";
    case "rename_file":
      return input.old_path ? `${input.old_path} → ${input.new_path}` : "";
    case "search_files":
      return input.query ? `"${input.query}"` : "";
    case "get_prompt_template":
      return input.slug ? String(input.slug) : "";
    case "get_student_data":
      return input.name ? String(input.name) : input.student_id ? String(input.student_id).slice(0, 8) + "..." : "";
    case "spawn_agent":
      return input.task ? String(input.task).slice(0, 50) : "";
    default:
      return "";
  }
}

// ─────────── Simple Markdown renderer ───────────

function MarkdownContent({ text, isUser }: { text: string; isUser: boolean }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} block={block} isUser={isUser} />
      ))}
    </div>
  );
}

type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang?: string; code: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "empty" };

function parseMarkdownBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      blocks.push({ type: "heading", level: 3, text: h3[1] });
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      blocks.push({ type: "heading", level: 2, text: h2[1] });
      i++;
      continue;
    }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) {
      blocks.push({ type: "heading", level: 1, text: h1[1] });
      i++;
      continue;
    }

    // List items
    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\.\s/.test(lines[i]) : /^\s*[-*]\s/.test(lines[i]))
      ) {
        items.push(
          lines[i].replace(ordered ? /^\s*\d+\.\s*/ : /^\s*[-*]\s*/, "")
        );
        i++;
      }
      blocks.push({ type: "list", items, ordered });
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].match(/^#{1,3}\s/) &&
      !(/^\s*[-*]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

function MarkdownBlock({ block, isUser }: { block: MdBlock; isUser: boolean }) {
  if (block.type === "empty") return null;

  if (block.type === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3";
    const sizes = {
      1: "text-base font-bold",
      2: "text-[15px] font-semibold",
      3: "text-sm font-semibold",
    };
    return (
      <Tag className={cn(sizes[block.level], block.level === 1 && "mt-1")}>
        <InlineMarkdown text={block.text} isUser={isUser} />
      </Tag>
    );
  }

  if (block.type === "code") {
    return (
      <pre
        className={cn(
          "rounded-lg px-3 py-2.5 text-xs font-mono overflow-x-auto",
          isUser
            ? "bg-white/10"
            : "bg-zinc-900 text-zinc-100 dark:bg-zinc-950"
        )}
      >
        <code>{block.code}</code>
      </pre>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={cn(
          "space-y-0.5 pl-4",
          block.ordered ? "list-decimal" : "list-disc"
        )}
      >
        {block.items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <InlineMarkdown text={item} isUser={isUser} />
          </li>
        ))}
      </ListTag>
    );
  }

  // paragraph
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      <InlineMarkdown text={block.text} isUser={isUser} />
    </p>
  );
}

/** Parses inline markdown: **bold**, *italic*, `code`, [links] */
function InlineMarkdown({ text, isUser }: { text: string; isUser: boolean }) {
  // Split on inline patterns
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={match.index}>{token.slice(1, -1)}</em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className={cn(
            "rounded px-1 py-0.5 text-xs font-mono",
            isUser ? "bg-white/15" : "bg-zinc-200 dark:bg-zinc-700"
          )}
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = match.index + token.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
