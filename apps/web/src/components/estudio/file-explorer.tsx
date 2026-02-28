import { useState, useRef, useEffect } from "react";
import {
  Trash2,
  Upload,
  Download,
  ChevronRight,
  ChevronDown,
  HardDrive,
  History,
  RotateCcw,
  Loader2,
  FileDown,
  List,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, API_BASE } from "@/lib/api";
import type { WorkspaceFile, WorkspaceFileVersion, GoogleDriveStatus } from "@aee-pro/shared";

interface FileExplorerProps {
  projectId: string;
  files: WorkspaceFile[];
  onFilesChange: () => void;
  onFileClick?: (file: WorkspaceFile) => void;
  selectedFile?: string;
}

interface TreeNode {
  name: string;
  path: string;
  file?: WorkspaceFile;
  children: TreeNode[];
  isDir: boolean;
}

type ViewMode = "list" | "grid";

/** Apple-style colorful file type icon */
function FileTypeIcon({ path, mimeType, size = "sm" }: { path: string; mimeType: string; size?: "sm" | "lg" }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isLarge = size === "lg";
  const base = isLarge
    ? "w-10 h-12 rounded-lg text-[10px] font-bold"
    : "w-4 h-5 rounded text-[6px] font-bold";

  // Determine icon style based on extension/mime
  const config = getFileTypeConfig(ext, mimeType);

  return (
    <div
      className={cn(
        base,
        "flex items-end justify-center pb-[2px] shrink-0 relative overflow-hidden border",
        config.bg,
        config.border,
        config.text,
      )}
    >
      {/* Folded corner */}
      <div
        className={cn(
          "absolute top-0 right-0 bg-white/40 dark:bg-white/20",
          isLarge ? "w-2.5 h-2.5 rounded-bl-md" : "w-1.5 h-1.5 rounded-bl-sm"
        )}
      />
      <span className="uppercase leading-none">{config.label}</span>
    </div>
  );
}

/** Folder icon with Apple-style gradient */
function FolderIcon({ size = "sm" }: { size?: "sm" | "lg" }) {
  const isLarge = size === "lg";
  return (
    <div
      className={cn(
        "shrink-0 rounded",
        isLarge ? "w-10 h-9" : "w-4 h-3.5",
        "bg-gradient-to-b from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600",
        "border border-amber-500/30 dark:border-amber-600/40",
        "relative"
      )}
    >
      {/* Tab */}
      <div
        className={cn(
          "absolute bg-gradient-to-b from-amber-300 to-amber-400 dark:from-amber-400 dark:to-amber-500 rounded-t",
          isLarge ? "-top-1.5 left-0.5 w-4 h-1.5" : "-top-1 left-0.5 w-2 h-1"
        )}
      />
    </div>
  );
}

function getFileTypeConfig(ext: string, mimeType: string) {
  if (ext === "tex" || mimeType === "text/x-latex")
    return { label: "TEX", bg: "bg-blue-500/15 dark:bg-blue-500/25", border: "border-blue-400/30 dark:border-blue-500/40", text: "text-blue-600 dark:text-blue-400" };
  if (ext === "pdf" || mimeType === "application/pdf")
    return { label: "PDF", bg: "bg-red-500/15 dark:bg-red-500/25", border: "border-red-400/30 dark:border-red-500/40", text: "text-red-600 dark:text-red-400" };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext) || mimeType.startsWith("image/"))
    return { label: ext.slice(0, 3).toUpperCase() || "IMG", bg: "bg-green-500/15 dark:bg-green-500/25", border: "border-green-400/30 dark:border-green-500/40", text: "text-green-600 dark:text-green-400" };
  if (ext === "md" || mimeType === "text/markdown")
    return { label: "MD", bg: "bg-purple-500/15 dark:bg-purple-500/25", border: "border-purple-400/30 dark:border-purple-500/40", text: "text-purple-600 dark:text-purple-400" };
  if (ext === "json" || mimeType === "application/json")
    return { label: "JSON", bg: "bg-yellow-500/15 dark:bg-yellow-500/25", border: "border-yellow-400/30 dark:border-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400" };
  if (ext === "docx")
    return { label: "DOC", bg: "bg-indigo-500/15 dark:bg-indigo-500/25", border: "border-indigo-400/30 dark:border-indigo-500/40", text: "text-indigo-600 dark:text-indigo-400" };
  if (ext === "txt" || mimeType === "text/plain")
    return { label: "TXT", bg: "bg-slate-500/15 dark:bg-slate-500/25", border: "border-slate-400/30 dark:border-slate-500/40", text: "text-slate-600 dark:text-slate-400" };
  if (["js", "ts", "jsx", "tsx"].includes(ext))
    return { label: ext.toUpperCase(), bg: "bg-cyan-500/15 dark:bg-cyan-500/25", border: "border-cyan-400/30 dark:border-cyan-500/40", text: "text-cyan-600 dark:text-cyan-400" };
  if (["html", "css"].includes(ext))
    return { label: ext.toUpperCase(), bg: "bg-orange-500/15 dark:bg-orange-500/25", border: "border-orange-400/30 dark:border-orange-500/40", text: "text-orange-600 dark:text-orange-400" };
  return { label: ext.slice(0, 3).toUpperCase() || "???", bg: "bg-gray-500/15 dark:bg-gray-500/25", border: "border-gray-400/30 dark:border-gray-500/40", text: "text-gray-600 dark:text-gray-400" };
}

export function FileExplorer({
  projectId,
  files,
  onFilesChange,
  onFileClick,
  selectedFile,
}: FileExplorerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("estudio-file-view") as ViewMode) || "list"
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["output", "images"])
  );
  const [uploading, setUploading] = useState(false);
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus>({ connected: false });
  const [savingToDrive, setSavingToDrive] = useState<string | null>(null);
  const [versionFileId, setVersionFileId] = useState<string | null>(null);
  const [versions, setVersions] = useState<WorkspaceFileVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);

  // Check Google Drive status
  useEffect(() => {
    api.get<GoogleDriveStatus>("/workspace/drive/status").then((res) => {
      if (res.success && res.data) setDriveStatus(res.data);
    });
  }, []);

  // Build tree from flat file list
  const tree = buildTree(files);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles?.length) return;

    setUploading(true);
    for (const file of Array.from(uploadFiles)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", file.name);

      const token = api.getToken();
      await fetch(
        `${API_BASE}/workspace/projects/${projectId}/files`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
    }
    setUploading(false);
    onFilesChange();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await api.delete(`/workspace/files/${fileId}`);
    if (res.success) {
      onFilesChange();
    }
  };

  const handleConnectDrive = async () => {
    const res = await api.get<{ url: string }>("/workspace/drive/auth-url");
    if (!res.success || !res.data) {
      alert(res.error || "Google Drive não está configurado no servidor.");
      return;
    }

    // Open OAuth in a centered popup window
    const w = 500;
    const h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      res.data.url,
      "google-drive-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Listen for the callback message from the popup
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "google-drive-connected") {
        setDriveStatus({ connected: true });
        window.removeEventListener("message", onMessage);
        popup?.close();
      } else if (event.data?.type === "google-drive-error") {
        alert(event.data.error || "Erro ao conectar Google Drive.");
        window.removeEventListener("message", onMessage);
      }
    };
    window.addEventListener("message", onMessage);

    // Fallback: clean up if popup is closed without completing
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", onMessage);
      }
    }, 500);
  };

  const handleSaveToDrive = async (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingToDrive(file.id);
    const res = await api.post("/workspace/drive/save", {
      fileId: file.id,
      folderName: "AEE+ Pro",
    });
    setSavingToDrive(null);
    if (!res.success) {
      alert(res.error ?? "Erro ao salvar no Drive");
    }
  };

  const handleExportDocx = async (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = api.getToken();
    const res = await fetch(`${API_BASE}/workspace/files/${file.id}/export/docx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (file.path.split("/").pop()?.replace(/\.\w+$/, "") || "document") + ".docx";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleShowVersions = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (versionFileId === fileId) {
      setVersionFileId(null);
      setVersions([]);
      return;
    }
    setVersionFileId(fileId);
    setLoadingVersions(true);
    const res = await api.get<WorkspaceFileVersion[]>(
      `/workspace/files/${fileId}/versions`
    );
    if (res.success && res.data) {
      setVersions(res.data);
    }
    setLoadingVersions(false);
  };

  const handleRestoreVersion = async (
    fileId: string,
    versionId: string
  ) => {
    setRestoringVersion(versionId);
    const res = await api.post(
      `/workspace/files/${fileId}/versions/${versionId}/restore`,
      {}
    );
    setRestoringVersion(null);
    if (res.success) {
      setVersionFileId(null);
      setVersions([]);
      onFilesChange();
    }
  };

  const handleDownload = async (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = api.getToken();
    const res = await fetch(`${API_BASE}/workspace/files/${file.id}?t=${Date.now()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.path.split("/").pop() || "download";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const toggleViewMode = () => {
    const next = viewMode === "list" ? "grid" : "list";
    setViewMode(next);
    localStorage.setItem("estudio-file-view", next);
  };

  const renderFileActions = (file: WorkspaceFile) => (
    <div className="hidden group-hover:flex items-center gap-0.5">
      {driveStatus.connected && (
        <button
          onClick={(e) => handleSaveToDrive(file, e)}
          className="p-0.5 hover:text-primary"
          title="Salvar no Google Drive"
          disabled={savingToDrive === file.id}
        >
          {savingToDrive === file.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <HardDrive className="h-3 w-3" />
          )}
        </button>
      )}
      {isExportableToDocx(file.mimeType, file.path) && (
        <button
          onClick={(e) => handleExportDocx(file, e)}
          className="p-0.5 hover:text-primary"
          title="Exportar DOCX"
        >
          <FileDown className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={(e) => handleShowVersions(file.id, e)}
        className={cn("p-0.5 hover:text-primary", versionFileId === file.id && "text-primary")}
        title="Histórico de versões"
      >
        <History className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => handleDownload(file, e)}
        className="p-0.5 hover:text-primary"
        title="Baixar"
      >
        <Download className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => handleDelete(file.id, e)}
        className="p-0.5 hover:text-destructive"
        title="Excluir"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );

  const renderVersionPanel = (file: WorkspaceFile) => (
    versionFileId === file.id ? (
      <div className="ml-8 mr-2 mb-1 border rounded bg-muted/30 text-xs">
        {loadingVersions ? (
          <div className="p-2 flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
          </div>
        ) : versions.length === 0 ? (
          <div className="p-2 text-muted-foreground">Sem versões anteriores</div>
        ) : (
          versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between px-2 py-1 hover:bg-muted"
            >
              <span>
                v{v.versionNumber} &mdash;{" "}
                {new Date(v.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                onClick={() => handleRestoreVersion(file.id, v.id)}
                className="p-0.5 hover:text-primary"
                title={`Restaurar versão ${v.versionNumber}`}
                disabled={restoringVersion === v.id}
              >
                {restoringVersion === v.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    ) : null
  );

  // ---------- List view ----------

  const renderListNode = (node: TreeNode, depth: number = 0) => {
    if (node.isDir) {
      const isExpanded = expandedDirs.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node.path)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs hover:bg-muted rounded transition-colors"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <FolderIcon size="sm" />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded &&
            node.children.map((child) => renderListNode(child, depth + 1))}
        </div>
      );
    }

    const file = node.file!;
    const isSelected = selectedFile === file.id;

    return (
      <div key={file.id}>
        <div
          onClick={() => onFileClick?.(file)}
          className={cn(
            "flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors cursor-pointer group",
            isSelected
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-foreground"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <FileTypeIcon path={file.path} mimeType={file.mimeType} size="sm" />
          <span className="truncate flex-1">{node.name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatBytes(file.sizeBytes ?? 0)}
          </span>
          {renderFileActions(file)}
        </div>
        {renderVersionPanel(file)}
      </div>
    );
  };

  // ---------- Grid view ----------

  const renderGridItems = (nodes: TreeNode[]) => {
    // Flatten all files (expand directories automatically in grid)
    const allFiles: WorkspaceFile[] = [];
    const collectFiles = (items: TreeNode[]) => {
      for (const node of items) {
        if (node.isDir) {
          collectFiles(node.children);
        } else if (node.file) {
          allFiles.push(node.file);
        }
      }
    };
    collectFiles(nodes);

    return (
      <div className="grid grid-cols-3 gap-1 px-2 py-1">
        {allFiles.map((file) => {
          const name = file.path.split("/").pop() ?? file.path;
          const isSelected = selectedFile === file.id;
          return (
            <div
              key={file.id}
              onClick={() => onFileClick?.(file)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer group transition-colors text-center",
                isSelected
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "hover:bg-muted"
              )}
            >
              <div className="relative">
                <FileTypeIcon path={file.path} mimeType={file.mimeType} size="lg" />
                <div className="absolute -top-1 -right-1 hidden group-hover:flex flex-col gap-0.5 bg-background border rounded shadow-sm p-0.5">
                  <button
                    onClick={(e) => handleDownload(file, e)}
                    className="p-0.5 hover:text-primary"
                    title="Baixar"
                  >
                    <Download className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(file.id, e)}
                    className="p-0.5 hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              <span className="text-[10px] leading-tight truncate w-full">{name}</span>
              <span className="text-[9px] text-muted-foreground">{formatBytes(file.sizeBytes ?? 0)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Arquivos
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleViewMode}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={viewMode === "list" ? "Ver em grade" : "Ver em lista"}
          >
            {viewMode === "list" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3 w-3 mr-1" />
            {uploading ? "..." : "Upload"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
          accept="image/*,.tex,.txt,.md,.json,.pdf,.docx"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Nenhum arquivo ainda.
            <br />
            Use o chat ou faça upload.
          </div>
        ) : viewMode === "list" ? (
          tree.map((node) => renderListNode(node))
        ) : (
          renderGridItems(tree)
        )}
      </div>

      {/* Google Drive connection */}
      <div className="border-t px-3 py-2">
        {driveStatus.connected ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="h-3 w-3 text-green-500" />
            <span className="truncate flex-1">Drive conectado</span>
            <button
              onClick={async () => {
                await api.post("/workspace/drive/disconnect", {});
                setDriveStatus({ connected: false });
              }}
              className="text-[10px] hover:text-destructive"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectDrive}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            <HardDrive className="h-3 w-3" />
            Conectar Google Drive
          </button>
        )}
      </div>
    </div>
  );
}

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.push({
          name,
          path: file.path,
          file,
          children: [],
          isDir: false,
        });
      } else {
        let dir = current.find((n) => n.isDir && n.name === name);
        if (!dir) {
          dir = { name, path, children: [], isDir: true };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }

  // Sort: dirs first, then files alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => {
      if (n.isDir) sortNodes(n.children);
    });
  };
  sortNodes(root);

  return root;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isExportableToDocx(mimeType: string, path: string): boolean {
  return (
    mimeType === "text/x-latex" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    path.endsWith(".tex") ||
    path.endsWith(".txt") ||
    path.endsWith(".md")
  );
}
