import { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileBarChart } from "lucide-react";
import { api } from "@/lib/api";
import type { AeeSession } from "@aee-pro/shared";

interface PeriodicReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  sessions: AeeSession[];
  onGenerated: () => void;
  defaultPeriodType?: string;
}

type PeriodType = "mensal" | "bimestral" | "semestral" | "anual";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

function getDefaultDates(periodType: PeriodType): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  let start: Date;

  switch (periodType) {
    case "mensal":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "bimestral": {
      const biMonth = Math.floor(now.getMonth() / 2) * 2;
      start = new Date(now.getFullYear(), biMonth, 1);
      break;
    }
    case "semestral": {
      const semester = now.getMonth() < 6 ? 0 : 6;
      start = new Date(now.getFullYear(), semester, 1);
      break;
    }
    case "anual":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now.getTime() - 60 * 86400000);
  }
  return { start: start.toISOString().slice(0, 10), end };
}

export function PeriodicReportDialog({
  open,
  onOpenChange,
  studentId,
  sessions,
  onGenerated,
  defaultPeriodType,
}: PeriodicReportDialogProps) {
  const [periodType, setPeriodType] = useState<PeriodType>(
    (defaultPeriodType as PeriodType) ?? "bimestral",
  );
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const pt = (defaultPeriodType as PeriodType) ?? "bimestral";
      setPeriodType(pt);
      const { start, end } = getDefaultDates(pt);
      setPeriodStart(start);
      setPeriodEnd(end);
      setError(null);
    }
  }, [open, defaultPeriodType]);

  useEffect(() => {
    const { start, end } = getDefaultDates(periodType);
    setPeriodStart(start);
    setPeriodEnd(end);
  }, [periodType]);

  // Count sessions in the selected period
  const sessionsInPeriod = sessions.filter(
    (s) => s.sessionDate >= periodStart && s.sessionDate <= periodEnd,
  );

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    const res = await api.post("/latex-documents/generate-periodic", {
      studentId,
      periodType,
      periodStart,
      periodEnd,
    });

    setGenerating(false);

    if (res.success) {
      onGenerated();
      onOpenChange(false);
    } else {
      setError(res.error ?? "Erro ao gerar relatório");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Gerar Relatório do Período</DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>

      <div className="px-6 pb-6 space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Periodicidade</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as PeriodType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Início</label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fim</label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-md bg-muted/50 p-3 flex items-center gap-2 text-sm">
          <FileBarChart className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>
            <strong>{sessionsInPeriod.length}</strong>{" "}
            {sessionsInPeriod.length === 1 ? "sessão encontrada" : "sessões encontradas"} neste
            período
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || !periodStart || !periodEnd}
          >
            {generating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Gerar Relatório
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
