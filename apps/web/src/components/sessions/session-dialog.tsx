import { useEffect, useState } from "react";
import type { AeeSession } from "@aee-pro/shared";
import { SESSION_TYPES } from "@aee-pro/shared";
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
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SessionDialog({
  open,
  onOpenChange,
  studentId,
  session,
  onSaved,
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
    };

    const res = isEditing
      ? await api.put(`/aee-sessions/${session!.id}`, payload)
      : await api.post("/aee-sessions", payload);

    setSaving(false);

    if (res.success) {
      onSaved();
      onOpenChange(false);
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
