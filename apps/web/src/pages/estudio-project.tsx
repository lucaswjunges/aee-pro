import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Maximize2, X, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chat } from "@/components/estudio/chat";
import { FileExplorer } from "@/components/estudio/file-explorer";
import { MonacoEditor } from "@/components/estudio/monaco-editor";
import { Terminal, type TerminalLog } from "@/components/estudio/terminal";
import { ModeToggle } from "@/components/estudio/mode-toggle";
import { api, API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import type { WorkspaceProject, WorkspaceFile, WorkspaceConversation } from "@aee-pro/shared";

type Tab = "chat" | "files" | "preview" | "editor";

export function EstudioProjectPage() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useMobile();

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [conversations, setConversations] = useState<WorkspaceConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [editFile, setEditFile] = useState<WorkspaceFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [mode, setMode] = useState<"simple" | "advanced" | "promax">("promax");
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

  // Track PDF file timestamps to detect new/recompiled PDFs
  const prevPdfStateRef = useRef<Map<string, string>>(new Map());
  const selectedFileRef = useRef(selectedFile);
  selectedFileRef.current = selectedFile;

  const loadProject = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    const res = await api.get<{
      files: WorkspaceFile[];
      conversations: WorkspaceConversation[];
    } & WorkspaceProject>(`/workspace/projects/${id}`);
    if (res.success && res.data) {
      const { files: f, conversations: c, ...proj } = res.data;

      // Detect new or recompiled PDF files → notify user
      const newPdfState = new Map(
        f
          .filter((file) => file.mimeType === "application/pdf")
          .map((file) => [file.id, file.updatedAt || ""])
      );
      if (prevPdfStateRef.current.size > 0) {
        let pdfChanged = false;
        let changedPdfFile: WorkspaceFile | undefined;
        for (const [pdfId, updatedAt] of newPdfState) {
          const prev = prevPdfStateRef.current.get(pdfId);
          if (prev === undefined || prev !== updatedAt) {
            pdfChanged = true;
            changedPdfFile = f.find((ff) => ff.id === pdfId);
            break;
          }
        }
        if (pdfChanged) {
          notifyPdfReady();
          // Auto-refresh preview if user is viewing the recompiled PDF
          if (changedPdfFile && selectedFileRef.current?.id === changedPdfFile.id) {
            const token = api.getToken();
            fetch(`${API_BASE}/workspace/files/${changedPdfFile.id}?t=${Date.now()}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then(async (res) => {
              if (res.ok) {
                const blob = await res.blob();
                setPreviewUrl(URL.createObjectURL(blob));
              }
            });
          }
        }
      } else if (newPdfState.size === 0) {
        // First load with no PDFs — just initialize
      }
      prevPdfStateRef.current = newPdfState;

      setProject(proj);
      setFiles(f);
      setConversations(c);
    } else if (!res.success) {
      setLoadError(res.error || "Não foi possível carregar o projeto");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProject();
    // Request notification permission on first visit
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [loadProject]);

  const handleFilesChange = useCallback(() => {
    loadProject();
  }, [loadProject]);

  const handleFileClick = useCallback(
    async (file: WorkspaceFile) => {
      setSelectedFile(file);

      if (file.mimeType === "application/pdf" || file.mimeType.startsWith("image/")) {
        setPreviewText(null);
        const token = api.getToken();
        // Cache-bust PDFs to always get the latest version after recompilation
        const cacheBust = file.mimeType === "application/pdf" ? `?t=${Date.now()}` : "";
        const res = await fetch(`${API_BASE}/workspace/files/${file.id}${cacheBust}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          if (isMobile) setActiveTab("preview");
        }
      } else if (isTextFile(file.mimeType)) {
        setPreviewUrl(null);
        // Fetch text content for preview
        const res = await api.get<{ content: string }>(
          `/workspace/files/${file.id}/text`
        );
        if (res.success && res.data) {
          setPreviewText(res.data.content);
          if (isMobile) setActiveTab("preview");
        }
        // In advanced mode, also open in editor
        if (mode === "advanced") {
          setEditFile(file);
          if (isMobile) setActiveTab("editor");
        }
      }
    },
    [isMobile, mode]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[calc(100vh-12rem)]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <WifiOff className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm text-center max-w-xs">{loadError}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setLoading(true); loadProject(); }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
          <Button asChild variant="ghost">
            <Link to="/estudio">Voltar</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Button asChild className="mt-4">
          <Link to="/estudio">Voltar ao Estúdio</Link>
        </Button>
      </div>
    );
  }

  const currentConversationId = conversations[0]?.id || null;

  // Mobile: tab-based layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 top-[3.5rem] z-40 bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Link
            to="/estudio"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="font-semibold truncate text-sm flex-1">
            {project.name}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(["chat", "files", "preview"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-xs font-medium text-center transition-colors",
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
              )}
            >
              {tab === "chat" ? "Chat" : tab === "files" ? "Arquivos" : "Preview"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "chat" && (
            <Chat
              projectId={project.id}
              conversationId={currentConversationId}
              onConversationId={() => {}}
              onFilesChange={handleFilesChange}
              showQuickActions={files.length === 0}
              qualityMode={mode === "promax" ? "promax" : "standard"}
            />
          )}
          {activeTab === "files" && (
            <FileExplorer
              projectId={project.id}
              files={files}
              onFilesChange={handleFilesChange}
              onFileClick={handleFileClick}
              selectedFile={selectedFile?.id}
            />
          )}
          {activeTab === "preview" && (previewUrl || previewText !== null) && (
            <div className="h-full">
              {selectedFile?.mimeType === "application/pdf" && previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              ) : selectedFile?.mimeType.startsWith("image/") && previewUrl ? (
                <div className="flex items-center justify-center h-full p-4">
                  <img
                    src={previewUrl}
                    alt={selectedFile.path}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : previewText !== null ? (
                <pre className="h-full overflow-auto p-4 text-xs font-mono bg-muted/30 whitespace-pre-wrap break-words leading-relaxed">
                  {previewText}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Selecione um arquivo para visualizar
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: split layout
  return (
    <>
    <div className="fixed inset-0 top-[3.5rem] z-40 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b">
        <Link
          to="/estudio"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Sparkles className="h-4 w-4 text-primary" />
        <h1 className="font-semibold truncate flex-1">{project.name}</h1>
        <ModeToggle mode={mode} onModeChange={setMode} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File explorer sidebar */}
        <div className="w-72 border-r flex-shrink-0 overflow-hidden">
          <FileExplorer
            projectId={project.id}
            files={files}
            onFilesChange={handleFilesChange}
            onFileClick={handleFileClick}
            selectedFile={selectedFile?.id}
          />
        </div>

        {mode === "simple" || mode === "promax" ? (
          <>
            {/* Chat area (simple/promax mode) */}
            <div className="flex-1 overflow-hidden">
              <Chat
                projectId={project.id}
                conversationId={currentConversationId}
                onConversationId={() => {}}
                onFilesChange={handleFilesChange}
                showQuickActions={files.length === 0}
                qualityMode={mode === "promax" ? "promax" : "standard"}
              />
            </div>

            {/* Preview panel */}
            {(previewUrl || previewText !== null) && selectedFile && (
              <div className="w-[40%] border-l flex-shrink-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium truncate">
                    {selectedFile.path}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setFullscreenPreview(true)}
                      title="Tela cheia"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setPreviewUrl(null);
                        setPreviewText(null);
                        setSelectedFile(null);
                      }}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {selectedFile.mimeType === "application/pdf" && previewUrl ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-full border-0"
                      title="PDF Preview"
                    />
                  ) : selectedFile.mimeType.startsWith("image/") && previewUrl ? (
                    <div className="flex items-center justify-center h-full p-4 bg-muted/30">
                      <img
                        src={previewUrl}
                        alt={selectedFile.path}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : previewText !== null ? (
                    <pre className="h-full overflow-auto p-4 text-xs font-mono bg-muted/30 whitespace-pre-wrap break-words leading-relaxed">
                      {previewText}
                    </pre>
                  ) : null}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Advanced mode: Editor + Terminal + Chat + Preview */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor area */}
              <div className="flex-1 overflow-hidden">
                <MonacoEditor
                  file={editFile}
                  projectId={project.id}
                  onSave={handleFilesChange}
                />
              </div>
              {/* Terminal */}
              <div className="h-40 border-t flex-shrink-0">
                <Terminal logs={terminalLogs} />
              </div>
            </div>

            {/* Chat + Preview sidebar (advanced mode) */}
            <div className="w-[35%] border-l flex-shrink-0 flex flex-col overflow-hidden">
              {/* Chat */}
              <div className={cn(
                "overflow-hidden",
                (previewUrl || previewText !== null) ? "h-1/2 border-b" : "flex-1"
              )}>
                <Chat
                  projectId={project.id}
                  conversationId={currentConversationId}
                  onConversationId={() => {}}
                  onFilesChange={handleFilesChange}
                  showQuickActions={false}
                />
              </div>
              {/* Preview */}
              {(previewUrl || previewText !== null) && selectedFile && (
                <div className="h-1/2 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b">
                    <span className="text-xs font-medium truncate">
                      {selectedFile.path}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => {
                        setPreviewUrl(null);
                        setPreviewText(null);
                        setSelectedFile(null);
                      }}
                    >
                      Fechar
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {selectedFile.mimeType === "application/pdf" && previewUrl ? (
                      <iframe
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title="PDF Preview"
                      />
                    ) : selectedFile.mimeType.startsWith("image/") && previewUrl ? (
                      <div className="flex items-center justify-center h-full p-2 bg-muted/30">
                        <img
                          src={previewUrl}
                          alt={selectedFile.path}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : previewText !== null ? (
                      <pre className="h-full overflow-auto p-4 text-xs font-mono bg-muted/30 whitespace-pre-wrap break-words leading-relaxed">
                        {previewText}
                      </pre>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>

    {/* Fullscreen preview overlay — rendered outside z-40 container to sit above the site header */}
    {fullscreenPreview && selectedFile && (previewUrl || previewText !== null) && (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-sm font-medium truncate">
            {selectedFile.path}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFullscreenPreview(false)}
          >
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          {selectedFile.mimeType === "application/pdf" && previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : selectedFile.mimeType.startsWith("image/") && previewUrl ? (
            <div className="flex items-center justify-center h-full p-8 bg-muted/30">
              <img
                src={previewUrl}
                alt={selectedFile.path}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : previewText !== null ? (
            <pre className="h-full overflow-auto p-6 text-sm font-mono bg-muted/30 whitespace-pre-wrap break-words leading-relaxed">
              {previewText}
            </pre>
          ) : null}
        </div>
      </div>
    )}
    </>
  );
}

function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript"
  );
}

/** Notify user that a PDF is ready — sound + browser notification (works in background tabs) */
function notifyPdfReady() {
  // 1. Browser notification (works in background tabs, has system sound)
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("PDF pronto!", {
        body: "O documento foi compilado com sucesso.",
        icon: "/favicon.ico",
        tag: "pdf-ready", // Deduplicates if multiple PDFs compile fast
      });
    }
  } catch {
    // Notification API not available
  }

  // 2. Audio chime (works in foreground, best-effort in background)
  try {
    const ctx = new AudioContext();
    // Resume in case browser suspended it (background tab policy)
    ctx.resume().then(() => {
      const now = ctx.currentTime;
      // Two-tone chime: C5 → E5
      const notes = [523.25, 659.25];
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = notes[i];
        gain.gain.setValueAtTime(0.3, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      }
      setTimeout(() => ctx.close(), 1000);
    });
  } catch {
    // AudioContext not available
  }
}
