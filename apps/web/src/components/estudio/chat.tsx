import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, StopCircle, Sparkles, Crown, ShieldCheck, ShieldAlert } from "lucide-react";
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
  queued?: boolean;
}

interface ChatProps {
  projectId: string;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  onFilesChange: () => void;
  showQuickActions: boolean;
  qualityMode?: "standard" | "promax";
}

export function Chat({
  projectId,
  conversationId,
  onConversationId,
  onFilesChange,
  showQuickActions,
  qualityMode,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false); // Mirror for use in async callbacks
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const messageQueueRef = useRef<string[]>([]);
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

  // --- Auto-accept toggle (review mode) ---
  const [autoAccept, setAutoAccept] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("estudio-auto-accept");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const toggleAutoAccept = useCallback(() => {
    setAutoAccept((prev) => {
      const next = !prev;
      localStorage.setItem("estudio-auto-accept", String(next));
      return next;
    });
  }, []);

  const handleUndoFile = useCallback(async (fileId: string, versionId: string) => {
    await api.post(`/workspace/drive/files/${fileId}/versions/${versionId}/restore`, {});
    onFilesChange();
  }, [onFilesChange]);

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

  // --- Delete message ---
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      const res = await api.delete<{ deletedIds: string[] }>(
        `/workspace/projects/${projectId}/messages/${messageId}`
      );
      if (res.success && res.data?.deletedIds) {
        const deletedSet = new Set(res.data.deletedIds);
        setMessages((prev) => prev.filter((m) => !deletedSet.has(m.id)));
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }, [projectId]);

  // --- Regenerate assistant message ---
  const handleRegenerate = useCallback(async (messageId: string) => {
    if (isStreaming) return;

    // Remove the message from local state
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    // Start streaming the regenerated response
    setCurrentSuggestion("");
    setIsStreaming(true);
    isStreamingRef.current = true;
    setIsThinking(false);
    setStreamText("");
    setStreamToolCalls([]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const token = api.getToken();
      const res = await fetch(
        `${API_BASE}/workspace/projects/${projectId}/messages/${messageId}/regenerate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            ...(qualityMode === "promax" ? { qualityMode: "promax" } : {}),
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
        isStreamingRef.current = false;
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const allToolCalls: SSEEvent[] = [];
      let receivedDone = false;

      while (!receivedDone) {
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
              debouncedFilesChange.flush();
              onFilesChange();
              receivedDone = true;
              reader.cancel().catch(() => {});
              break;
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
      isStreamingRef.current = false;
      setIsThinking(false);
      abortControllerRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
      fetchAISuggestion(conversationId);
    }
  }, [projectId, isStreaming, conversationId, debouncedFilesChange, onFilesChange, fetchAISuggestion, streamText]);

  // Load existing messages (skip while streaming to avoid overwriting live state)
  useEffect(() => {
    if (!conversationId) return;
    if (isStreamingRef.current) return;
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
        // Double-check: streaming may have started between the fetch and the resolve
        if (isStreamingRef.current) return;
        if (res.success && res.data) {
          setMessages(
            res.data
              .filter((m) => (m.role === "user" || m.role === "assistant") && m.content && m.content !== "(processando...)")
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

  // Auto-send template prompt from sessionStorage
  const templateSentRef = useRef(false);
  useEffect(() => {
    if (templateSentRef.current) return;
    const key = `estudio-template-prompt:${projectId}`;
    const pending = sessionStorage.getItem(key);
    if (pending) {
      templateSentRef.current = true;
      sessionStorage.removeItem(key);
      // Small delay to let the component fully mount
      setTimeout(() => sendMessage(pending), 300);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!text.trim()) return;

    if (isStreaming) {
      const trimmed = text.trim();
      messageQueueRef.current = [...messageQueueRef.current, trimmed];
      setMessageQueue([...messageQueueRef.current]);
      setInput("");
      pushToHistory(trimmed);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        queued: true,
      }]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

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
    isStreamingRef.current = true;
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
            ...(qualityMode === "promax" ? { qualityMode: "promax" } : {}),
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
      let receivedDone = false;

      while (!receivedDone) {
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
              debouncedFilesChange.flush();
              onFilesChange();
              receivedDone = true;
              reader.cancel().catch(() => {});
              break;
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
      isStreamingRef.current = false;
      setIsThinking(false);
      abortControllerRef.current = null;

      // Process next message in queue
      const next = messageQueueRef.current[0];
      if (next) {
        messageQueueRef.current = messageQueueRef.current.slice(1);
        setMessageQueue([...messageQueueRef.current]);
        // Remove queued flag from the message about to be processed
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.role === "user" && m.queued && m.content === next);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], queued: false };
            return updated;
          }
          return prev;
        });
        setTimeout(() => sendMessage(next), 100);
        return;
      }

      // Re-focus textarea so user can type immediately
      setTimeout(() => textareaRef.current?.focus(), 50);
      // Fetch AI-powered suggestion for next prompt
      fetchAISuggestion(conversationId);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    messageQueueRef.current = [];
    setMessageQueue([]);
    setMessages((prev) => prev.map((m) => m.queued ? { ...m, queued: false } : m));
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
              {qualityMode === "promax" && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Modo Pro Max ativo — Claude Opus com qualidade publicável
                  </span>
                </div>
              )}
            </div>
            {showQuickActions && (
              <QuickActions onAction={(prompt) => sendMessage(prompt)} />
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className="relative">
                <ChatMessage
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  toolCalls={msg.toolCalls}
                  autoAccept={autoAccept}
                  onUndoFile={handleUndoFile}
                  onDelete={handleDeleteMessage}
                  onRegenerate={handleRegenerate}
                  globalStreaming={isStreaming}
                />
                {msg.queued && (
                  <span className="inline-block ml-12 -mt-1 mb-2 text-[10px] text-muted-foreground/60 bg-muted/50 rounded px-1.5 py-0.5">
                    Na fila
                  </span>
                )}
              </div>
            ))}
            {isStreaming && (
              <ChatMessage
                role="assistant"
                content={streamText}
                toolCalls={streamToolCalls}
                isStreaming={!streamText && streamToolCalls.length === 0}
                isThinking={isThinking}
                liveStreaming
                autoAccept={autoAccept}
                onUndoFile={handleUndoFile}
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
            />
          </div>
          {isStreaming ? (
            <>
              <Button
                size="icon"
                className="rounded-xl h-[42px] w-[42px]"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                title="Enfileirar (Enter)"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="rounded-xl h-[42px] w-[42px]"
                onClick={handleStop}
                title="Parar"
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            </>
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
        {messageQueue.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 px-1 mt-1">
            <span>{messageQueue.length} na fila</span>
            <button
              onClick={() => {
                messageQueueRef.current = [];
                setMessageQueue([]);
                setMessages((prev) => prev.map((m) => m.queued ? { ...m, queued: false } : m));
              }}
              className="text-destructive hover:underline"
            >
              limpar
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <button
            onClick={toggleAutoAccept}
            className={`inline-flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 transition-colors ${
              autoAccept
                ? "text-muted-foreground/60 hover:text-muted-foreground"
                : "text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15"
            }`}
            title={autoAccept ? "Clique para revisar edições antes de aceitar" : "Clique para aplicar edições automaticamente"}
          >
            {autoAccept ? (
              <>
                <ShieldCheck className="h-3 w-3" />
                <span>Aplicar automaticamente</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-3 w-3" />
                <span>Revisar edições</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground/60">
            Tab sugestão · ↑ histórico · Enter enviar
          </p>
        </div>
      </div>
    </div>
  );
}
