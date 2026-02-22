import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, Clock, Calendar } from "lucide-react";
import type { AeeSession } from "@aee-pro/shared";
import { SESSION_TYPES } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SessionCardProps {
  session: AeeSession;
  onEdit: (session: AeeSession) => void;
  onDelete: (id: string) => void;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getSessionTypeLabel(value: string) {
  return SESSION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function SessionCard({ session, onEdit, onDelete }: SessionCardProps) {
  const navigate = useNavigate();

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    if ((e.target as HTMLElement).closest("button")) return;
    navigate(`/alunos/${session.studentId}/sessoes/${session.id}`);
  };

  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-3 cursor-pointer hover:border-primary/40 transition-colors"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {formatDate(session.sessionDate)}
          </div>
          {(session.startTime || session.endTime) && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {session.startTime ?? "—"}
              {session.endTime ? ` – ${session.endTime}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(session)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(session.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs">
          {getSessionTypeLabel(session.sessionType)}
        </Badge>
        {session.present ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
            Presente
          </Badge>
        ) : (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
            Ausente
          </Badge>
        )}
      </div>

      {session.objectives && (
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">Objetivos: </span>
          <span className="line-clamp-2">{session.objectives}</span>
        </div>
      )}

      {session.activitiesPerformed && (
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">Atividades: </span>
          <span className="line-clamp-2">{session.activitiesPerformed}</span>
        </div>
      )}

      {session.studentResponse && (
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">Resposta do aluno: </span>
          <span className="line-clamp-2">{session.studentResponse}</span>
        </div>
      )}
    </div>
  );
}
