import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Prompt } from "@aee-pro/shared";
import { Loader2, CheckCircle, AlertCircle, Check } from "lucide-react";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onGenerated: () => void;
}

type BatchStatus = Record<string, "pending" | "generating" | "completed" | "error">;

export function GenerateDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onGenerated,
}: GenerateDialogProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      setBatchStatus({});
      setBatchRunning(false);
      api.get<Prompt[]>("/prompts").then((res) => {
        if (res.success && res.data) {
          setPrompts(res.data);
        }
        setLoading(false);
      });
    }
  }, [open]);

  const toggleSelect = (slug: string) => {
    if (batchRunning) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (batchRunning) return;
    if (selected.size === prompts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(prompts.map((p) => p.slug)));
    }
  };

  const handleGenerateBatch = async () => {
    if (selected.size === 0) return;
    setBatchRunning(true);
    setError(null);

    const slugs = Array.from(selected);
    const initialStatus: BatchStatus = {};
    for (const slug of slugs) {
      initialStatus[slug] = "pending";
    }
    setBatchStatus(initialStatus);

    let hasError = false;

    for (const slug of slugs) {
      setBatchStatus((prev) => ({ ...prev, [slug]: "generating" }));

      const res = await api.post("/documents/generate", { studentId, promptSlug: slug });

      if (res.success) {
        setBatchStatus((prev) => ({ ...prev, [slug]: "completed" }));
      } else {
        setBatchStatus((prev) => ({ ...prev, [slug]: "error" }));
        hasError = true;
      }
    }

    onGenerated();
    setBatchRunning(false);

    if (!hasError) {
      setTimeout(() => onOpenChange(false), 1000);
    }
  };

  const completedCount = Object.values(batchStatus).filter((s) => s === "completed").length;
  const errorCount = Object.values(batchStatus).filter((s) => s === "error").length;

  const statusIcon = (slug: string) => {
    const status = batchStatus[slug];
    if (!status) return null;
    switch (status) {
      case "generating":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Gerar Documentos</DialogTitle>
        <DialogDescription>
          Selecione os tipos de documento para {studentName}
        </DialogDescription>
      </DialogHeader>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {batchRunning && (
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Gerando... {completedCount}/{selected.size} concluídos
            {errorCount > 0 && `, ${errorCount} com erro`}
          </span>
        </div>
      )}

      {/* Select all / batch controls */}
      {!loading && prompts.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={selectAll}
            disabled={batchRunning}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            {selected.size === prompts.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          {selected.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selected.size} {selected.size === 1 ? "selecionado" : "selecionados"}
            </Badge>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {loading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : (
          prompts.map((prompt) => (
            <button
              key={prompt.slug}
              onClick={() => toggleSelect(prompt.slug)}
              disabled={batchRunning}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left disabled:opacity-60 ${
                selected.has(prompt.slug)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {batchStatus[prompt.slug] ? (
                  statusIcon(prompt.slug)
                ) : selected.has(prompt.slug) ? (
                  <div className="h-5 w-5 rounded border-2 border-primary bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded border-2 border-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{prompt.name}</p>
                  {!prompt.isBuiltIn && (
                    <Badge variant="secondary" className="text-xs">Custom</Badge>
                  )}
                </div>
                {prompt.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {prompt.description}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t">
        <p className="text-xs text-muted-foreground">
          Selecione os documentos e clique em Gerar.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {batchRunning ? "Fechar" : "Cancelar"}
          </Button>
          {selected.size > 0 && !batchRunning && (
            <Button size="sm" onClick={handleGenerateBatch}>
              Gerar {selected.size === 1 ? "documento" : `${selected.size} documentos`}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
