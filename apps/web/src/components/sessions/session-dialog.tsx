import { useEffect, useState } from "react";
import type { AeeSession, DimensionRatingKey } from "@aee-pro/shared";
import { SESSION_TYPES, DIMENSION_RATINGS, RATING_SCALE } from "@aee-pro/shared";
import { Dialog, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  session?: AeeSession | null;
  onSaved: () => void;
  existingSessions?: AeeSession[];
  onReportSuggestion?: (periodType: string, count: number) => void;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function checkReportThreshold(
  existingSessions: AeeSession[],
  newSessionDate: string,
): { periodType: string; count: number } | null {
  const now = new Date(newSessionDate);
  const year = now.getFullYear();
  const month = now.getMonth();

  // Count sessions in current bimester
  const biMonth = Math.floor(month / 2) * 2;
  const biStart = new Date(year, biMonth, 1).toISOString().slice(0, 10);
  const biEnd = new Date(year, biMonth + 2, 0).toISOString().slice(0, 10);
  const biCount = existingSessions.filter(
    (s) => s.sessionDate >= biStart && s.sessionDate <= biEnd,
  ).length + 1; // +1 for the new session being saved

  if (biCount >= 8) return { periodType: "bimestral", count: biCount };

  // Count sessions in current month
  const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  const monthCount = existingSessions.filter(
    (s) => s.sessionDate >= monthStart && s.sessionDate <= monthEnd,
  ).length + 1;

  if (monthCount >= 4) return { periodType: "mensal", count: monthCount };

  return null;
}

export function SessionDialog({
  open,
  onOpenChange,
  studentId,
  session,
  onSaved,
  existingSessions,
  onReportSuggestion,
}: SessionDialogProps) {
  const isEditing = !!session;

  const [sessionDate, setSessionDate] = useState(todayISO());
  const [startTime, setStartTime] = useState(nowTime());
  const [endTime, setEndTime] = useState("");
  const [present, setPresent] = useState(1);
  const [sessionType, setSessionType] = useState("individual");
  const [objectives, setObjectives] = useState("");
  const [activitiesPerformed, setActivitiesPerformed] = useState("");
  const [studentResponse, setStudentResponse] = useState("");
  const [observations, setObservations] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [ratings, setRatings] = useState<Record<DimensionRatingKey, number | null>>({
    ratingCognitive: null,
    ratingLinguistic: null,
    ratingMotor: null,
    ratingSocial: null,
    ratingAutonomy: null,
    ratingAcademic: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (session) {
        setSessionDate(session.sessionDate);
        setStartTime(session.startTime ?? "");
        setEndTime(session.endTime ?? "");
        setPresent(session.present);
        setSessionType(session.sessionType);
        setObjectives(session.objectives ?? "");
        setActivitiesPerformed(session.activitiesPerformed ?? "");
        setStudentResponse(session.studentResponse ?? "");
        setObservations(session.observations ?? "");
        setNextSteps(session.nextSteps ?? "");
        setRatings({
          ratingCognitive: session.ratingCognitive ?? null,
          ratingLinguistic: session.ratingLinguistic ?? null,
          ratingMotor: session.ratingMotor ?? null,
          ratingSocial: session.ratingSocial ?? null,
          ratingAutonomy: session.ratingAutonomy ?? null,
          ratingAcademic: session.ratingAcademic ?? null,
        });
      } else {
        setSessionDate(todayISO());
        setStartTime(nowTime());
        setEndTime("");
        setPresent(1);
        setSessionType("individual");
        setObjectives("");
        setActivitiesPerformed("");
        setStudentResponse("");
        setObservations("");
        setNextSteps("");
        setRatings({
          ratingCognitive: null,
          ratingLinguistic: null,
          ratingMotor: null,
          ratingSocial: null,
          ratingAutonomy: null,
          ratingAcademic: null,
        });
      }
      setError(null);
    }
  }, [open, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      studentId,
      sessionDate,
      startTime: startTime || null,
      endTime: endTime || null,
      present,
      sessionType,
      objectives: objectives || null,
      activitiesPerformed: activitiesPerformed || null,
      studentResponse: studentResponse || null,
      observations: observations || null,
      nextSteps: nextSteps || null,
      ratingCognitive: ratings.ratingCognitive,
      ratingLinguistic: ratings.ratingLinguistic,
      ratingMotor: ratings.ratingMotor,
      ratingSocial: ratings.ratingSocial,
      ratingAutonomy: ratings.ratingAutonomy,
      ratingAcademic: ratings.ratingAcademic,
    };

    const res = isEditing
      ? await api.put(`/aee-sessions/${session!.id}`, payload)
      : await api.post("/aee-sessions", payload);

    setSaving(false);

    if (res.success) {
      onSaved();
      onOpenChange(false);
      // Check if report suggestion should be shown (only for new sessions)
      if (!isEditing && existingSessions && onReportSuggestion) {
        const suggestion = checkReportThreshold(existingSessions, sessionDate);
        if (suggestion) {
          // Delay slightly so the dialog closes first
          setTimeout(() => onReportSuggestion(suggestion.periodType, suggestion.count), 300);
        }
      }
    } else {
      setError(res.error ?? "Erro ao salvar sessão");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{isEditing ? "Editar Sessão" : "Nova Sessão"}</DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>

      <form onSubmit={handleSubmit} className="overflow-y-auto px-6 pb-6 space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data *</label>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo</label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hora início</label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hora fim</label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Presença</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="present"
                checked={present === 1}
                onChange={() => setPresent(1)}
                className="accent-primary"
              />
              <span className="text-sm">Presente</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="present"
                checked={present === 0}
                onChange={() => setPresent(0)}
                className="accent-primary"
              />
              <span className="text-sm">Ausente</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Objetivos planejados</label>
          <Textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="Objetivos trabalhados nesta sessão..."
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Atividades realizadas</label>
          <Textarea
            value={activitiesPerformed}
            onChange={(e) => setActivitiesPerformed(e.target.value)}
            placeholder="Descreva as atividades realizadas..."
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Resposta / engajamento do aluno</label>
          <Textarea
            value={studentResponse}
            onChange={(e) => setStudentResponse(e.target.value)}
            placeholder="Como o aluno respondeu às atividades..."
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Observações</label>
          <Textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Observações gerais..."
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Próximos passos</label>
          <Textarea
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            placeholder="O que planejar para a próxima sessão..."
            rows={2}
          />
        </div>

        {/* Avaliação por Dimensão */}
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Avaliação por Dimensão <span className="text-muted-foreground font-normal">(opcional)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DIMENSION_RATINGS.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <label className="text-sm text-muted-foreground">{dim.label}</label>
                <select
                  value={ratings[dim.key] ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : Number(e.target.value);
                    setRatings((prev) => ({ ...prev, [dim.key]: val }));
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                >
                  <option value="">—</option>
                  {RATING_SCALE.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value} — {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !sessionDate}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEditing ? "Salvar" : "Registrar Sessão"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
