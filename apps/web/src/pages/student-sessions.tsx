import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ArrowLeft, FileText, FileCode, ClipboardList } from "lucide-react";
import type { Student, AeeSession } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionCard } from "@/components/sessions/session-card";
import { SessionDialog } from "@/components/sessions/session-dialog";
import { api } from "@/lib/api";

export function StudentSessionsPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<AeeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<AeeSession | null>(null);

  const fetchData = async () => {
    if (!id) return;
    const [studentRes, sessionsRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<AeeSession[]>(`/aee-sessions?studentId=${id}`),
    ]);
    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (sessionsRes.success && sessionsRes.data) setSessions(sessionsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleDelete = async (sessionId: string) => {
    if (!confirm("Excluir esta sessão?")) return;
    const res = await api.delete(`/aee-sessions/${sessionId}`);
    if (res.success) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
  };

  const handleEdit = (session: AeeSession) => {
    setEditingSession(session);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingSession(null);
    setDialogOpen(true);
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

  const totalSessions = sessions.length;
  const presentCount = sessions.filter((s) => s.present).length;
  const absentCount = totalSessions - presentCount;

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
              <h1 className="text-xl sm:text-2xl font-bold">Sessões</h1>
              <p className="text-muted-foreground truncate">{student.name}</p>
            </div>
            <Button onClick={handleNew} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nova Sessão
            </Button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <div className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">
          <ClipboardList className="h-4 w-4" />
          Sessões
        </div>
        <Link
          to={`/alunos/${id}/documentos`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          <FileText className="h-4 w-4" />
          Documentos Texto
        </Link>
        <Link
          to={`/alunos/${id}/documentos-latex`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </Link>
      </div>

      {/* Stats */}
      {totalSessions > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{totalSessions} {totalSessions === 1 ? "sessão" : "sessões"}</span>
          <span className="text-green-600 dark:text-green-400">{presentCount} presença{presentCount !== 1 ? "s" : ""}</span>
          {absentCount > 0 && (
            <span className="text-red-600 dark:text-red-400">{absentCount} falta{absentCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma sessão registrada.</p>
          <p className="text-sm mt-1">Clique em "Nova Sessão" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <SessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={id!}
        session={editingSession}
        onSaved={fetchData}
      />
    </div>
  );
}
