import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  FileText,
  Printer,
  Code,
  Eye,
  RefreshCw,
  Wand2,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LatexDocument } from "@aee-pro/shared";
import { HEAT_LEVELS, SIZE_LEVELS } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfViewer } from "@/components/latex/pdf-viewer";
import { LatexEditor } from "@/components/latex/latex-editor";
import { LatexChat } from "@/components/latex/latex-chat";
import { CompilationError } from "@/components/latex/compilation-error";
import { api, API_BASE } from "@/lib/api";
import { VOCE_SABIA } from "@/lib/voce-sabia";

type ViewMode = "pdf" | "code" | "chat";

function CompilationWarnings({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);

  // Deduplicate and count repeated warnings
  const grouped = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of warnings) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([msg, count]) => ({ msg, count }));
  }, [warnings]);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 print:hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{warnings.length} {warnings.length === 1 ? "aviso" : "avisos"} de compilação</span>
        {expanded ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
      </button>
      {expanded && (
        <ul className="border-t border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
          {grouped.map((g, i) => (
            <li key={i} className="text-xs text-amber-700 dark:text-amber-400 font-mono break-all">
              {g.count > 1 ? `(${g.count}x) ${g.msg}` : g.msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LatexDocumentViewPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<LatexDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("pdf");
  const [editedSource, setEditedSource] = useState("");
  const [recompiling, setRecompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const voceSabia = useMemo(() => VOCE_SABIA[Math.floor(Math.random() * VOCE_SABIA.length)], []);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocument = useCallback(async () => {
    if (!docId) return;
    const res = await api.get<LatexDocument>(`/latex-documents/${docId}`);
    if (res.success && res.data) {
      setDocument(res.data);
      setEditedSource(res.data.latexSource ?? "");
    }
    setLoading(false);
  }, [docId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  // Auto-poll when document is in progress (generating/compiling)
  useEffect(() => {
    const isInProgress = document?.status === "generating" || document?.status === "compiling";
    if (isInProgress) {
      pollingRef.current = setInterval(fetchDocument, 3000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [document?.status, fetchDocument]);

  const handleDownloadPdf = async () => {
    if (!docId) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/latex-documents/${docId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document?.title ?? "documento"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [docxLoading, setDocxLoading] = useState(false);

  const handleDownloadDocx = async () => {
    if (!docId) return;
    setDocxLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/latex-documents/${docId}/export/docx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let msg = "Erro ao gerar DOCX";
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch { /* ignore */ }
        alert(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document?.title ?? "documento"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro ao conectar ao servidor para gerar DOCX.");
    } finally {
      setDocxLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveSource = async () => {
    if (!docId) return;
    setSaving(true);
    await api.put(`/latex-documents/${docId}`, { latexSource: editedSource });
    setSaving(false);
  };

  const handleRecompile = async () => {
    if (!docId || !document) return;
    if (document.status === "completed") {
      if (!confirm("O PDF atual será perdido e recompilado. Tem certeza?")) return;
    }
    // Save first if source changed
    if (editedSource !== document.latexSource) {
      await api.put(`/latex-documents/${docId}`, { latexSource: editedSource });
    }
    setRecompiling(true);
    const res = await api.post<LatexDocument>(`/latex-documents/${docId}/recompile`, {});
    if (res.success && res.data) {
      setDocument(res.data);
      setViewMode("pdf");
    }
    setRecompiling(false);
  };

  const handleEditAI = async (instruction: string) => {
    if (!docId) return;
    const res = await api.post<LatexDocument>(`/latex-documents/${docId}/edit-ai`, {
      instruction,
    });
    if (res.success && res.data) {
      // Update state immediately — polling will track progress
      setDocument(res.data);
      setEditedSource(res.data.latexSource ?? "");
      setViewMode("pdf");
    } else {
      throw new Error(res.error ?? "Erro na edição");
    }
  };

  const handleFixWithAI = async () => {
    await handleEditAI("Corrija os erros de compilação LaTeX neste documento. Mantenha o conteúdo e estilo.");
  };

  const handleRegenerate = async () => {
    if (!docId || !id) return;
    setRegenerating(true);
    const res = await api.post<LatexDocument>(`/latex-documents/${docId}/regenerate`, {});
    setRegenerating(false);
    if (res.success && res.data) {
      navigate(`/alunos/${id}/documentos-latex/${res.data.id}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`/alunos/${id}/documentos-latex`}>Voltar</Link>
        </Button>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
    completed: { label: "Concluído", variant: "success" },
    generating: { label: "Gerando...", variant: "warning" },
    compiling: { label: "Compilando...", variant: "warning" },
    compile_error: { label: "Erro compilação", variant: "destructive" },
    error: { label: "Erro", variant: "destructive" },
  };

  const status = statusConfig[document.status] ?? statusConfig.error;
  const isProcessing = document.status === "generating" || document.status === "compiling";
  const heatName = HEAT_LEVELS.find((h) => h.level === document.heatLevel)?.name;
  const sizeName = SIZE_LEVELS.find((s) => s.level === document.sizeLevel)?.name;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 print:hidden">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
          <Link to={`/alunos/${id}/documentos-latex`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold break-words">{document.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={status.variant}>{status.label}</Badge>
            {heatName && <Badge variant="outline">{heatName}</Badge>}
            {sizeName && <Badge variant="outline">{sizeName}</Badge>}
            {document.pdfSizeBytes && (
              <span className="text-xs text-muted-foreground">
                {Math.round(document.pdfSizeBytes / 1024)} KB
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {document.status === "completed" && (
          <>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          </>
        )}
        {document.latexSource && !isProcessing && (
          <>
            <Button variant="outline" size="sm" onClick={handleDownloadDocx} disabled={docxLoading}>
              {docxLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
              DOCX
            </Button>
            <Button
              variant={viewMode === "code" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(viewMode === "code" ? "pdf" : "code")}
            >
              {viewMode === "code" ? (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Ver PDF
                </>
              ) : (
                <>
                  <Code className="h-4 w-4 mr-1" />
                  Editar Código
                </>
              )}
            </Button>
            <Button
              variant={viewMode === "chat" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(viewMode === "chat" ? "pdf" : "chat")}
            >
              <Wand2 className="h-4 w-4 mr-1" />
              {viewMode === "chat" ? "Ver PDF" : "Editar com IA"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecompile}
              disabled={recompiling}
            >
              {recompiling ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Recompilar
            </Button>
          </>
        )}
      </div>

      {/* Compilation error */}
      {document.status === "compile_error" && document.lastCompilationError && (
        <div className="space-y-2">
          <CompilationError
            error={document.lastCompilationError}
            onFixWithAI={handleFixWithAI}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="print:hidden"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {regenerating ? "Regenerando..." : "Regenerar do Zero"}
          </Button>
        </div>
      )}

      {/* Compilation warnings */}
      {(() => {
        const warnings: string[] = (() => {
          try {
            return document.compilationWarnings ? JSON.parse(document.compilationWarnings) : [];
          } catch {
            return [];
          }
        })();
        if (warnings.length === 0) return null;
        return <CompilationWarnings warnings={warnings} />;
      })()}

      {/* Main content */}
      {viewMode === "pdf" && document.status === "completed" && (
        <PdfViewer documentId={document.id} className="h-[70vh] w-full" />
      )}

      {viewMode === "code" && (
        <div className="space-y-3">
          <LatexEditor
            value={editedSource}
            onChange={setEditedSource}
            className="h-[60vh]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveSource}
              disabled={saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              size="sm"
              onClick={handleRecompile}
              disabled={recompiling}
            >
              {recompiling ? "Recompilando..." : "Salvar e Recompilar"}
            </Button>
          </div>
        </div>
      )}

      {viewMode === "chat" && (
        <div className="space-y-4">
          {document.status === "completed" && (
            <PdfViewer documentId={document.id} className="h-[40vh] w-full" />
          )}
          <LatexChat onSendInstruction={handleEditAI} />
        </div>
      )}

      {(document.status === "generating" || document.status === "compiling") && (
        <div className="text-center py-12 text-muted-foreground print:hidden">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          <p className="text-lg">
            {document.status === "generating" ? "Gerando documento com IA..." : "Compilando LaTeX..."}
          </p>
          <p className="mt-2 text-sm">A página será atualizada automaticamente.</p>
          <div className="mt-6 mx-auto max-w-md rounded-lg border bg-muted/50 p-4 text-left">
            <p className="text-xs font-semibold text-foreground mb-1">Você sabia?</p>
            <p className="text-xs leading-relaxed">{voceSabia}</p>
          </div>
        </div>
      )}

      {document.status === "error" && (
        <div className="space-y-2 print:hidden">
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na geração: {document.lastCompilationError}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {regenerating ? "Regenerando..." : "Regenerar do Zero"}
          </Button>
        </div>
      )}
    </div>
  );
}
