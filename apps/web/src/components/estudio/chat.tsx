import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, StopCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "./chat-message";
import { QuickActions } from "./quick-actions";
import { API_BASE, api } from "@/lib/api";

/** Static fallback suggestions (used when AI suggestion is not yet available) */
const FALLBACK_SUGGESTIONS = [
  "Gere um PEI completo para este aluno",
  "Crie um jogo educativo imprimível",
  "Faça um relatório de evolução do aluno",
  "Crie um material de aula adaptado",
  "Gere uma apresentação sobre o progresso do aluno",
  "Escreva uma anamnese completa",
  "Crie um plano de metas SMART",
  "Gere um parecer descritivo",
  "Faça um estudo de caso detalhado",
  "Crie atividades de estimulação cognitiva",
];

/** Debounce a callback — collapses rapid calls into one after `delay` ms */
function useDebouncedCallback(callback: () => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(() => {
    const debounced = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current();
      }, delay);
    };
    debounced.flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        callbackRef.current();
      }
    };
    return debounced;
  }, [delay]);
}

/** Raw SSE event from the agent loop */
interface SSEEvent {
  type: string;
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  result?: unknown;
  agentId?: string;
  agentTask?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: SSEEvent[];
}

interface ChatProps {
  projectId: string;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  onFilesChange: () => void;
  showQuickActions: boolean;
}

export function Chat({
  projectId,
  conversationId,
  onConversationId,
  onFilesChange,
  showQuickActions,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<SSEEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Prompt history (Arrow Up / Arrow Down) ---
  const historyKey = `estudio-prompt-history:${projectId}`;
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) || "[]");
    } catch {
      return [];
    }
  });
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef("");

  const pushToHistory = useCallback(
    (text: string) => {
      setPromptHistory((prev) => {
        // Avoid duplicating consecutive entries
        const trimmed = text.trim();
        const updated = prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed];
        // Keep last 50 entries
        const capped = updated.slice(-50);
        localStorage.setItem(historyKey, JSON.stringify(capped));
        return capped;
      });
      historyIndexRef.current = -1;
    },
    [historyKey]
  );

  // --- Ghost text suggestions (Tab to accept) ---
  const fallbackIndexRef = useRef(
    Math.floor(Math.random() * FALLBACK_SUGGESTIONS.length)
  );
  const [currentSuggestion, setCurrentSuggestion] = useState(
    FALLBACK_SUGGESTIONS[fallbackIndexRef.current]
  );
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);

  // Fetch AI-powered suggestion based on conversation context
  const fetchAISuggestion = useCallback(
    async (convId: string | null) => {
      if (!convId) {
        // No conversation yet — use fallback
        fallbackIndexRef.current =
          (fallbackIndexRef.current + 1) % FALLBACK_SUGGESTIONS.length;
        setCurrentSuggestion(FALLBACK_SUGGESTIONS[fallbackIndexRef.current]);
        return;
      }

      setIsFetchingSuggestion(true);
      try {
        const res = await api.post<{ suggestion: string | null }>(
          `/workspace/projects/${projectId}/suggest`,
          { conversationId: convId }
        );
        if (res.success && res.data?.suggestion) {
          setCurrentSuggestion(res.data.suggestion);
        } else {
          // Fallback
          fallbackIndexRef.current =
            (fallbackIndexRef.current + 1) % FALLBACK_SUGGESTIONS.length;
          setCurrentSuggestion(FALLBACK_SUGGESTIONS[fallbackIndexRef.current]);
        }
      } catch {
        fallbackIndexRef.current =
          (fallbackIndexRef.current + 1) % FALLBACK_SUGGESTIONS.length;
        setCurrentSuggestion(FALLBACK_SUGGESTIONS[fallbackIndexRef.current]);
      } finally {
        setIsFetchingSuggestion(false);
      }
    },
    [projectId]
  );

  // Rotate fallback (for when we don't want to fetch AI)
  const rotateFallback = useCallback(() => {
    fallbackIndexRef.current =
      (fallbackIndexRef.current + 1) % FALLBACK_SUGGESTIONS.length;
    setCurrentSuggestion(FALLBACK_SUGGESTIONS[fallbackIndexRef.current]);
  }, []);

  // Debounce file refreshes — collapses rapid tool_result events into one refresh
  const debouncedFilesChange = useDebouncedCallback(onFilesChange, 600);

  // Load existing messages
  useEffect(() => {
    if (!conversationId) return;
    api
      .get<
        Array<{
          id: string;
          role: string;
          content: string;
          toolCalls: string | null;
        }>
      >(`/workspace/projects/${projectId}/messages?conversationId=${conversationId}`)
      .then((res) => {
        if (res.success && res.data) {
          setMessages(
            res.data
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
              }))
          );
        }
      });
  }, [projectId, conversationId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, streamToolCalls, isThinking]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    pushToHistory(text);
    setInput("");
    setCurrentSuggestion(""); // Clear while streaming
    setIsStreaming(true);
    setIsThinking(false);
    setStreamText("");
    setStreamToolCalls([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const token = api.getToken();
      const res = await fetch(
        `${API_BASE}/workspace/projects/${projectId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text.trim(),
            conversationId,
          }),
          signal: abortController.signal,
        }
      );

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Erro: ${(error as { error?: string }).error || res.statusText}`,
          },
        ]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const allToolCalls: SSEEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event: SSEEvent = JSON.parse(data);

            if (event.type === "text" && event.content) {
              fullText += event.content;
              setStreamText(fullText);
              setIsThinking(false);
            } else if (
              event.type === "tool_call" ||
              event.type === "tool_result" ||
              event.type === "agent_spawn" ||
              event.type === "agent_result"
            ) {
              allToolCalls.push(event);
              setStreamToolCalls([...allToolCalls]);
              setIsThinking(false);
              // Refresh files when a file-modifying tool completes (debounced)
              if (event.type === "tool_result") {
                const tool = event.tool || "";
                if (["write_file", "edit_file", "delete_file", "compile_latex"].includes(tool)) {
                  debouncedFilesChange();
                }
              }
            } else if (event.type === "thinking") {
              setIsThinking(true);
            } else if (event.type === "error") {
              fullText += `\n\nErro: ${event.content}`;
              setStreamText(fullText);
              setIsThinking(false);
            } else if (event.type === "done") {
              setIsThinking(false);
              // Flush any pending debounced refresh, then do final refresh
              debouncedFilesChange.flush();
              onFilesChange();
            }
          } catch {
            // Ignore malformed SSE
          }
        }
      }

      // Finalize assistant message
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullText,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamText("");
      setStreamToolCalls([]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
        const partial: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: streamText + "\n\n*(interrompido pelo usuário)*",
        };
        setMessages((prev) => [...prev, partial]);
        setStreamText("");
        setStreamToolCalls([]);
      } else {
        const msg = err instanceof Error ? err.message : "Erro de conexão";
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: `Erro: ${msg}` },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
      // Re-focus textarea so user can type immediately
      setTimeout(() => textareaRef.current?.focus(), 50);
      // Fetch AI-powered suggestion for next prompt
      fetchAISuggestion(conversationId);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter → send
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
      return;
    }

    // Tab → accept ghost suggestion (when empty)
    if (e.key === "Tab" && !input.trim() && currentSuggestion) {
      e.preventDefault();
      setInput(currentSuggestion);
      setTimeout(adjustTextarea, 0);
      return;
    }

    // Escape → clear input
    if (e.key === "Escape") {
      e.preventDefault();
      setInput("");
      historyIndexRef.current = -1;
      setTimeout(adjustTextarea, 0);
      return;
    }

    // Arrow Up → navigate prompt history backwards
    if (e.key === "ArrowUp") {
      const el = e.currentTarget;
      // Only activate at line 1 (cursor before any newline)
      const textBefore = el.value.slice(0, el.selectionStart);
      if (textBefore.includes("\n")) return; // Let default behavior handle multi-line

      if (promptHistory.length === 0) return;
      e.preventDefault();

      if (historyIndexRef.current === -1) {
        // Save current input before browsing
        savedInputRef.current = input;
        historyIndexRef.current = promptHistory.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
      }

      setInput(promptHistory[historyIndexRef.current]);
      setTimeout(adjustTextarea, 0);
      return;
    }

    // Arrow Down → navigate prompt history forwards
    if (e.key === "ArrowDown") {
      if (historyIndexRef.current === -1) return; // Not browsing history

      const el = e.currentTarget;
      const textAfter = el.value.slice(el.selectionEnd);
      if (textAfter.includes("\n")) return;

      e.preventDefault();

      if (historyIndexRef.current < promptHistory.length - 1) {
        historyIndexRef.current++;
        setInput(promptHistory[historyIndexRef.current]);
      } else {
        // Back to the saved input
        historyIndexRef.current = -1;
        setInput(savedInputRef.current);
      }
      setTimeout(adjustTextarea, 0);
      return;
    }

    // Any other key resets history browsing
    if (historyIndexRef.current !== -1 && e.key.length === 1) {
      historyIndexRef.current = -1;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isStreaming ? (
          <div className="space-y-6 pt-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">
                Como posso ajudar?
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Descreva o que deseja criar ou escolha uma ação rápida
              </p>
            </div>
            {showQuickActions && (
              <QuickActions onAction={(prompt) => sendMessage(prompt)} />
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolCalls={msg.toolCalls}
              />
            ))}
            {isStreaming && (
              <ChatMessage
                role="assistant"
                content={streamText}
                toolCalls={streamToolCalls}
                isStreaming={!streamText && streamToolCalls.length === 0}
                isThinking={isThinking}
                liveStreaming
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            {/* Ghost suggestion text (visible when input is empty) */}
            {!input && !isStreaming && (
              <div
                className="absolute inset-0 px-4 py-2.5 text-sm text-muted-foreground/40 pointer-events-none select-none truncate leading-[1.625]"
                aria-hidden="true"
              >
                {isFetchingSuggestion ? "Pensando…" : currentSuggestion}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextarea();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                // If no AI suggestion loaded yet, show a fallback
                if (!input && !currentSuggestion && !isFetchingSuggestion) {
                  rotateFallback();
                }
              }}
              placeholder=""
              className="w-full resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[42px] max-h-[150px]"
              style={{ background: "transparent" }}
              rows={1}
              disabled={isStreaming}
            />
          </div>
          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              className="rounded-xl h-[42px] w-[42px]"
              onClick={handleStop}
              title="Parar"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="rounded-xl h-[42px] w-[42px]"
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              title="Enviar (Enter)"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
          Tab aceitar sugestão · ↑ prompt anterior · Enter enviar
        </p>
      </div>
    </div>
  );
}
