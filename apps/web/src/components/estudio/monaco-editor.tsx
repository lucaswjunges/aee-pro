import { useEffect, useRef, useCallback } from "react";
import { api, API_BASE } from "@/lib/api";
import type { WorkspaceFile } from "@aee-pro/shared";

interface MonacoEditorProps {
  file: WorkspaceFile | null;
  projectId: string;
  onSave?: () => void;
}

/**
 * Lightweight code editor using a textarea with monospace styling.
 * For the MVP we use a simple textarea instead of Monaco to avoid
 * the heavy dependency (~5MB). Monaco can be added later in a
 * lazy-loaded upgrade.
 */
export function MonacoEditor({ file, projectId, onSave }: MonacoEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);

  // Load file content
  useEffect(() => {
    if (!file) return;
    api
      .get<{ content: string }>(`/workspace/files/${file.id}/text`)
      .then((res) => {
        if (res.success && res.data) {
          contentRef.current = res.data.content;
          if (textareaRef.current) {
            textareaRef.current.value = res.data.content;
          }
          dirtyRef.current = false;
        }
      });
  }, [file?.id]);

  const handleSave = useCallback(async () => {
    if (!file || !dirtyRef.current || !textareaRef.current) return;

    const content = textareaRef.current.value;
    const token = api.getToken();

    await fetch(
      `${API_BASE}/workspace/projects/${projectId}/files/text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          path: file.path,
          content,
        }),
      }
    );

    contentRef.current = content;
    dirtyRef.current = false;
    onSave?.();
  }, [file, projectId, onSave]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Selecione um arquivo para editar
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            {file.path}
          </span>
          {dirtyRef.current && (
            <span className="text-xs text-yellow-600">modificado</span>
          )}
        </div>
        <button
          onClick={handleSave}
          className="text-xs text-primary hover:underline"
        >
          Salvar (Ctrl+S)
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="flex-1 w-full p-3 font-mono text-sm bg-background resize-none focus:outline-none leading-relaxed"
        spellCheck={false}
        onChange={() => {
          dirtyRef.current = true;
        }}
      />
    </div>
  );
}
