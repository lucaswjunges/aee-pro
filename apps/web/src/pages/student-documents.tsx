import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ArrowLeft } from "lucide-react";
import type { Student, Document } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentList } from "@/components/documents/document-list";
import { GenerateDialog } from "@/components/documents/generate-dialog";
import { api } from "@/lib/api";

export function StudentDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    const [studentRes, docsRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<Document[]>(`/documents?studentId=${id}`),
    ]);
    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (docsRes.success && docsRes.data) setDocuments(docsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleDelete = async (docId: string) => {
    const res = await api.delete(`/documents/${docId}`);
    if (res.success) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  };

  const handleRegenerate = async (docId: string) => {
    setRegeneratingId(docId);
    const res = await api.post<Document>(`/documents/${docId}/regenerate`, {});
    setRegeneratingId(null);
    if (res.success) {
      fetchData();
    }
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
            <Button onClick={() => setDialogOpen(true)} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              Gerar Documento
            </Button>
          </div>
        </div>
      </div>

      <DocumentList
        documents={documents}
        studentId={id!}
        onDelete={handleDelete}
        onRegenerate={handleRegenerate}
        regeneratingId={regeneratingId}
      />

      <GenerateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={id!}
        studentName={student.name}
        onGenerated={fetchData}
      />
    </div>
  );
}
