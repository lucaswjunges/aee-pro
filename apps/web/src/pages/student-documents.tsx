import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ArrowLeft, Wand2, FileText, FileCode, ClipboardList } from "lucide-react";
import type { Student, Document } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentList } from "@/components/documents/document-list";
import { GenerateDialog } from "@/components/documents/generate-dialog";
import { BatchEditDialog } from "@/components/documents/batch-edit-dialog";
import { api } from "@/lib/api";

export function StudentDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditOpen, setBatchEditOpen] = useState(false);

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

  // Poll while any document is in-progress (generating)
  const hasInProgress = documents.some((d) => d.status === "generating");
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    if (hasInProgress) {
      pollRef.current = setInterval(fetchData, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [hasInProgress]);

  const handleDelete = async (docId: string) => {
    const res = await api.delete(`/documents/${docId}`);
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
    api.post<Document>(`/documents/${docId}/regenerate`, {}).finally(() => {
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
            <div className="flex gap-2 shrink-0">
              {documents.some((d) => d.status === "completed") && (
                <Button
                  variant={selectionMode ? "outline" : "secondary"}
                  size="sm"
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    setSelectedIds(new Set());
                  }}
                >
                  <Wand2 className="h-4 w-4 mr-1" />
                  {selectionMode ? "Cancelar" : "Editar com IA"}
                </Button>
              )}
              {!selectionMode && (
                <Button onClick={() => setDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Gerar Documento
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <Link
          to={`/alunos/${id}/sessoes`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          <ClipboardList className="h-4 w-4" />
          Sessões
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">
          <FileText className="h-4 w-4" />
          Documentos Texto
        </div>
        <Link
          to={`/alunos/${id}/documentos-latex`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </Link>
      </div>

      <DocumentList
        documents={documents}
        studentId={id!}
        onDelete={handleDelete}
        onRegenerate={handleRegenerate}
        regeneratingId={regeneratingId}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={(docId) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(docId)) {
              next.delete(docId);
            } else {
              next.add(docId);
            }
            return next;
          });
        }}
      />

      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button size="sm" onClick={() => setBatchEditOpen(true)}>
              <Wand2 className="h-4 w-4 mr-1" />
              Editar com IA
            </Button>
          </div>
        </div>
      )}

      <GenerateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={id!}
        studentName={student.name}
        onGenerated={fetchData}
      />

      <BatchEditDialog
        open={batchEditOpen}
        onOpenChange={setBatchEditOpen}
        documents={documents.filter((d) => selectedIds.has(d.id))}
        onCompleted={() => {
          fetchData();
          setSelectionMode(false);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
