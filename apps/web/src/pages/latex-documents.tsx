import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  FileText,
  FileCode,
  ClipboardList,
  BookOpen,
  TrendingUp,
  Sparkles,
  Download,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { Student, LatexDocument } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LatexDocumentList } from "@/components/latex/latex-document-list";
import { LatexGenerateDialog } from "@/components/latex/latex-generate-dialog";
import { DossieDialog } from "@/components/latex/dossie-dialog";
import { api, API_BASE } from "@/lib/api";

/** Workspace output file returned by the API */
interface WorkspaceOutputFile {
  id: string;
  projectId: string;
  projectName: string;
  path: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Unified item for the sorted list */
type DocItem =
  | { kind: "latex"; doc: LatexDocument }
  | { kind: "workspace"; file: WorkspaceOutputFile };

function getItemDate(item: DocItem): string {
  if (item.kind === "latex") {
    return item.doc.generatedAt || item.doc.createdAt || "";
  }
  return item.file.updatedAt || item.file.createdAt || "";
}

export function LatexDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<LatexDocument[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceOutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dossieDialogOpen, setDossieDialogOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    const [studentRes, docsRes, wsRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<LatexDocument[]>(`/latex-documents?studentId=${id}`),
      api.get<WorkspaceOutputFile[]>(`/workspace/student/${id}/output-files`),
    ]);
    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (docsRes.success && docsRes.data) setDocuments(docsRes.data);
    if (wsRes.success && wsRes.data) setWorkspaceFiles(wsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Poll while any document is in-progress (generating/compiling)
  const hasInProgress = documents.some(
    (d) => d.status === "generating" || d.status === "compiling",
  );
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    if (hasInProgress) {
      pollRef.current = setInterval(fetchData, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [hasInProgress]);

  const handleDelete = async (docId: string) => {
    const res = await api.delete(`/latex-documents/${docId}`);
    if (res.success) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  };

  const handleDeleteWorkspaceFile = async (fileId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este arquivo?")) return;
    const res = await api.delete(`/workspace/files/${fileId}`);
    if (res.success) {
      setWorkspaceFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const handleDownloadWorkspaceFile = async (file: WorkspaceOutputFile) => {
    const token = api.getToken();
    const res = await fetch(`${API_BASE}/workspace/files/${file.id}?t=${Date.now()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.path.split("/").pop() || "download.pdf";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleRegenerate = (docId: string) => {
    setRegeneratingId(docId);
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "generating" as const } : d)),
    );
    api.post(`/latex-documents/${docId}/regenerate`, {}).finally(() => {
      setRegeneratingId(null);
      fetchData();
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Aluno não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/alunos">Voltar para Alunos</Link>
        </Button>
      </div>
    );
  }

  // Build unified sorted list
  const allItems: DocItem[] = [
    ...documents.map((doc): DocItem => ({ kind: "latex", doc })),
    ...workspaceFiles.map((file): DocItem => ({ kind: "workspace", file })),
  ];
  allItems.sort((a, b) => getItemDate(b).localeCompare(getItemDate(a)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
          <Link to="/alunos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">Documentos</h1>
              <p className="text-muted-foreground truncate">{student.name}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDossieDialogOpen(true)}
                disabled={!documents.some((d) => d.status === "completed" && d.pdfR2Key)}
              >
                <BookOpen className="h-4 w-4 mr-1" />
                Dossiê
              </Button>
              <Button onClick={() => setDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Gerar Documento LaTeX
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b overflow-x-auto">
        <Link
          to={`/alunos/${id}/sessoes`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <ClipboardList className="h-4 w-4" />
          Sessões
        </Link>
        <Link
          to={`/alunos/${id}/evolucao`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <TrendingUp className="h-4 w-4" />
          Evolução
        </Link>
        <Link
          to={`/alunos/${id}/documentos`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <FileText className="h-4 w-4" />
          Documentos Texto
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary whitespace-nowrap">
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-3">
        PDFs com formatação profissional — tabelas, cabeçalhos e layout prontos para impressão.
      </p>

      {/* Unified sorted list */}
      {allItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Nenhum documento gerado ainda.
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Gere documentos LaTeX aqui ou use o Estúdio para criar PDFs com IA.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {allItems.map((item) =>
            item.kind === "latex" ? (
              <LatexDocCardInline
                key={`latex-${item.doc.id}`}
                document={item.doc}
                studentId={id!}
                onDelete={handleDelete}
                onRegenerate={handleRegenerate}
                regenerating={regeneratingId === item.doc.id}
              />
            ) : (
              <WorkspaceFileCard
                key={`ws-${item.file.id}`}
                file={item.file}
                onDelete={handleDeleteWorkspaceFile}
                onDownload={handleDownloadWorkspaceFile}
              />
            )
          )}
        </div>
      )}

      <LatexGenerateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={id!}
        studentName={student.name}
        onGenerated={fetchData}
      />

      <DossieDialog
        open={dossieDialogOpen}
        onOpenChange={setDossieDialogOpen}
        studentId={id!}
        studentName={student.name}
        documents={documents}
      />
    </div>
  );
}

// ─────── Inline LaTeX Document Card (reuses existing logic) ───────

import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { HEAT_LEVELS, SIZE_LEVELS } from "@aee-pro/shared";
import { PdfIcon } from "@/components/ui/pdf-icon";

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { label: "Concluído", variant: "success" },
  generating: { label: "Gerando...", variant: "warning" },
  compiling: { label: "Compilando...", variant: "warning" },
  compile_error: { label: "Erro compilação", variant: "destructive" },
  error: { label: "Erro", variant: "destructive" },
};

function LatexDocCardInline({
  document,
  studentId,
  onDelete,
  onRegenerate,
  regenerating,
}: {
  document: LatexDocument;
  studentId: string;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  regenerating?: boolean;
}) {
  const status = statusConfig[document.status] ?? statusConfig.error;
  const isProcessing = document.status === "generating" || document.status === "compiling";
  const isBusy = regenerating || isProcessing;
  const heatName = HEAT_LEVELS.find((h) => h.level === document.heatLevel)?.name ?? `${document.heatLevel}`;
  const sizeName = SIZE_LEVELS.find((s) => s.level === document.sizeLevel)?.name ?? `${document.sizeLevel}`;
  const dateSource = isProcessing ? document.createdAt : document.generatedAt;
  const formattedDate = dateSource
    ? new Date(dateSource).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Link
            to={`/alunos/${studentId}/documentos-latex/${document.id}`}
            className="flex items-start gap-3 min-w-0 flex-1"
          >
            <div className="relative shrink-0 mt-0.5">
              <PdfIcon size="sm" />
              {document.status === "compile_error" && (
                <AlertTriangle className="h-3 w-3 text-destructive absolute -bottom-1 -right-1" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium break-words leading-snug">{document.title}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline" className="text-[10px]">{heatName}</Badge>
                <Badge variant="outline" className="text-[10px]">{sizeName}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {formattedDate && (
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                )}
                {document.pdfSizeBytes && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(document.pdfSizeBytes / 1024)} KB
                  </span>
                )}
              </div>
            </div>
          </Link>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRegenerate(document.id)}
              disabled={isBusy}
              title="Regenerar"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm("Tem certeza que deseja excluir este documento LaTeX?")) {
                  onDelete(document.id);
                }
              }}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────── Workspace File Card ───────

function WorkspaceFileCard({
  file,
  onDelete,
  onDownload,
}: {
  file: WorkspaceOutputFile;
  onDelete: (id: string) => void;
  onDownload: (file: WorkspaceOutputFile) => void;
}) {
  const fileName = file.path.split("/").pop() || file.path;
  const formattedDate = (file.updatedAt || file.createdAt)
    ? new Date(file.updatedAt || file.createdAt!).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card className="border-violet-200 dark:border-violet-800/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="relative shrink-0 mt-0.5">
              <PdfIcon size="sm" />
              <Sparkles className="h-3 w-3 text-violet-500 absolute -bottom-1 -right-1" />
            </div>
            <div className="min-w-0">
              <p className="font-medium break-words leading-snug">{fileName}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-[10px]">
                  Estúdio
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {file.projectName}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {formattedDate && (
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                )}
                {file.sizeBytes && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(file.sizeBytes / 1024)} KB
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              asChild
              title="Abrir no Estúdio"
            >
              <Link to={`/estudio/${file.projectId}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDownload(file)}
              title="Baixar"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(file.id)}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
