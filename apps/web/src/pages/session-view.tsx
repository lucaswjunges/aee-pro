import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Pencil,
  Trash2,
  Target,
  Activity,
  MessageSquare,
  Eye,
  ArrowRight,
  ClipboardList,
  FileText,
  FileCode,
  TrendingUp,
} from "lucide-react";
import type { Student, AeeSession } from "@aee-pro/shared";
import { SESSION_TYPES, DIMENSION_RATINGS, RATING_SCALE } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionDialog } from "@/components/sessions/session-dialog";
import { api } from "@/lib/api";

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getSessionTypeLabel(value: string) {
  return SESSION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function SessionViewPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [session, setSession] = useState<AeeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchData = async () => {
    if (!id || !sessionId) return;
    const [studentRes, sessionRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<AeeSession>(`/aee-sessions/${sessionId}`),
    ]);
    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (sessionRes.success && sessionRes.data) setSession(sessionRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id, sessionId]);

  const handleDelete = async () => {
    if (!session || !confirm("Excluir esta sessão?")) return;
    const res = await api.delete(`/aee-sessions/${session.id}`);
    if (res.success) {
      window.location.href = `/alunos/${id}/sessoes`;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!student || !session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Sessão não encontrada.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`/alunos/${id}/sessoes`}>Voltar para Sessões</Link>
        </Button>
      </div>
    );
  }

  const sections = [
    { icon: Target, label: "Objetivos planejados", content: session.objectives },
    { icon: Activity, label: "Atividades realizadas", content: session.activitiesPerformed },
    { icon: MessageSquare, label: "Resposta / engajamento do aluno", content: session.studentResponse },
    { icon: Eye, label: "Observações", content: session.observations },
    { icon: ArrowRight, label: "Próximos passos", content: session.nextSteps },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
          <Link to={`/alunos/${id}/sessoes`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">
                Sessão — {formatDate(session.sessionDate)}
              </h1>
              <p className="text-muted-foreground truncate">{student.name}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b overflow-x-auto">
        <Link
          to={`/alunos/${id}/sessoes`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary whitespace-nowrap"
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
        <Link
          to={`/alunos/${id}/documentos-latex`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </Link>
      </div>

      {/* Meta info */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{formatDate(session.sessionDate)}</span>
          </div>
          {(session.startTime || session.endTime) && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {session.startTime ?? "—"}
              {session.endTime ? ` – ${session.endTime}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{getSessionTypeLabel(session.sessionType)}</Badge>
          {session.present ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              Presente
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
              Ausente
            </Badge>
          )}
        </div>
      </div>

      {/* Dimension ratings */}
      {DIMENSION_RATINGS.some((d) => session[d.key] != null) && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Avaliação por Dimensão</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DIMENSION_RATINGS.map((dim) => {
              const val = session[dim.key];
              if (val == null) return null;
              const scale = RATING_SCALE.find((s) => s.value === val);
              return (
                <div key={dim.key} className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${scale?.color ?? "bg-gray-400"}`} />
                  <span className="text-sm">
                    <span className="font-medium">{dim.label}:</span>{" "}
                    {val} — {scale?.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content sections */}
      {sections.map(({ icon: Icon, label, content }) => {
        if (!content) return null;
        return (
          <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Icon className="h-4 w-4" />
              {label}
            </div>
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          </div>
        );
      })}

      {/* Empty state if no content at all */}
      {sections.every((s) => !s.content) && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Nenhum detalhe registrado nesta sessão.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            Adicionar detalhes
          </Button>
        </div>
      )}

      <SessionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        studentId={id!}
        session={session}
        onSaved={fetchData}
      />
    </div>
  );
}
