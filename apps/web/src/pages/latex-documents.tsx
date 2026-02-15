import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ArrowLeft, FileText, FileCode } from "lucide-react";
import type { Student, LatexDocument } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LatexDocumentList } from "@/components/latex/latex-document-list";
import { LatexGenerateDialog } from "@/components/latex/latex-generate-dialog";
import { api } from "@/lib/api";

export function LatexDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<LatexDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    const [studentRes, docsRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<LatexDocument[]>(`/latex-documents?studentId=${id}`),
    ]);
    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (docsRes.success && docsRes.data) setDocuments(docsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Poll while any document is in-progress (generating/compiling)
  const hasInProgress = documents.some(
    (d) => d.status === "generating" || d.status === "compiling",
  );
  const pollRef = useRef<ReturnType<typeof setInterval>>();
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

  const handleRegenerate = (docId: string) => {
    setRegeneratingId(docId);
    // Optimistic update: immediately show "generating" status
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
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Gerar Documento LaTeX
            </Button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <Link
          to={`/alunos/${id}/documentos`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          <FileText className="h-4 w-4" />
          Documentos Texto
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-3">
        PDFs com formatação profissional — tabelas, cabeçalhos e layout prontos para impressão.
      </p>

      {/* List */}
      <LatexDocumentList
        documents={documents}
        studentId={id!}
        onDelete={handleDelete}
        onRegenerate={handleRegenerate}
        regeneratingId={regeneratingId}
      />

      <LatexGenerateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={id!}
        studentName={student.name}
        onGenerated={fetchData}
      />
    </div>
  );
}
