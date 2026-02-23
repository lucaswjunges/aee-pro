import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Raw SSE event as sent by the agent loop */
interface RawSSEEvent {
  type: string;
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: { success?: boolean; output?: string; error?: string; filePath?: string };
  agentId?: string;
  agentTask?: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: RawSSEEvent[];
  isStreaming?: boolean;
  isThinking?: boolean;
  /** True only for the currently-streaming message (tools may still be in-flight) */
  liveStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  toolCalls,
  isStreaming,
  isThinking,
  liveStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";

  // Group tool_call + tool_result pairs.
  // For stored/finalized messages (not live streaming), force all pairs as completed
  // to avoid showing "Executando..." on old messages that may lack tool_result events.
  const toolPairs = groupToolEvents(toolCalls || [], !liveStreaming);

  return (
    <div
      className={cn(
        "flex gap-3 py-4",
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
        {/* Tool calls (before text content) */}
        {toolPairs.length > 0 && (
          <ToolCallGroup pairs={toolPairs} />
        )}

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
      </div>
    </div>
  );
}

// ─────────── Tool call pairing and display ───────────

interface ToolPair {
  type: "tool" | "agent";
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: { success?: boolean; output?: string; error?: string; filePath?: string };
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

function ToolCallGroup({ pairs }: { pairs: ToolPair[] }) {
  const [expanded, setExpanded] = useState(false);
  const completedCount = pairs.filter((p) => p.completed).length;
  const hasErrors = pairs.some((p) => p.result && !p.result.success);
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
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <Check className="h-3.5 w-3.5 flex-shrink-0" />
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
        <div className="mt-1 rounded-lg border bg-muted/30 divide-y divide-border/50 overflow-hidden">
          {pairs.map((pair, i) => (
            <ToolCallDetail key={i} pair={pair} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallDetail({ pair }: { pair: ToolPair }) {
  const [showResult, setShowResult] = useState(false);

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

  return (
    <div className="px-3 py-2 text-xs">
      <button
        onClick={() => pair.completed && setShowResult(!showResult)}
        title={hoverTitle}
        className="flex items-center gap-2 w-full text-left"
      >
        {pair.completed ? (
          isError ? (
            <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
          ) : (
            <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
          )
        ) : (
          <Icon className="h-3 w-3 text-amber-500 animate-spin flex-shrink-0" />
        )}
        <span className={cn(
          "font-medium",
          isError ? "text-red-600 dark:text-red-400" : "text-foreground"
        )}>
          {label}
        </span>
        {detail && (
          <span className="text-muted-foreground truncate flex-1">{detail}</span>
        )}
        {pair.completed && pair.result?.filePath && (
          <span className="text-muted-foreground/70 text-[10px] flex-shrink-0">
            {pair.result.filePath}
          </span>
        )}
      </button>

      {/* Expandable result */}
      {showResult && resultText && (
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

function getToolIcon(tool: string) {
  const icons: Record<string, typeof Wrench> = {
    read_file: FileText,
    write_file: FileEdit,
    edit_file: FileEdit,
    list_files: FolderOpen,
    delete_file: Trash2,
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
    case "search_files":
      return input.query ? `"${input.query}"` : "";
    case "get_prompt_template":
      return input.slug ? String(input.slug) : "";
    case "get_student_data":
      return input.student_id ? String(input.student_id).slice(0, 8) + "..." : "";
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
