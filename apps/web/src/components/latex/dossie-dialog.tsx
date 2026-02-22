import { useState } from "react";
import { AlertCircle, BookOpen, Loader2 } from "lucide-react";
import type { LatexDocument } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { API_BASE, api } from "@/lib/api";

interface DossieDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  documents: LatexDocument[];
}

export function DossieDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  documents,
}: DossieDialogProps) {
  const completedDocs = documents.filter((d) => d.status === "completed" && d.pdfR2Key);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(completedDocs.map((d) => d.id)),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset selections when dialog opens with new docs
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setSelectedIds(new Set(completedDocs.map((d) => d.id)));
      setError(null);
    }
    onOpenChange(v);
  };

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(completedDocs.map((d) => d.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = api.getToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 160_000);

      const res = await fetch(`${API_BASE}/latex-documents/dossie`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          studentId,
          documentIds: Array.from(selectedIds),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Erro ${res.status}` }));
        throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="([^"]+)"/);
      a.download = filenameMatch?.[1] || `Dossie_${studentName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      handleOpenChange(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Tempo limite excedido. O dossiê pode ser muito grande — tente com menos documentos.");
      } else {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Dossiê do Aluno
        </DialogTitle>
        <DialogDescription>
          Compilar documentos de {studentName} em um PDF único com capa e sumário
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-y-auto flex-1 min-h-0 px-6 space-y-4">
        {/* Select/deselect controls */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} de {completedDocs.length} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={loading}>
              Selecionar todos
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll} disabled={loading}>
              Desmarcar todos
            </Button>
          </div>
        </div>

        {/* Document checkboxes */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {completedDocs.map((doc) => (
            <label
              key={doc.id}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(doc.id)}
                onChange={() => toggleDoc(doc.id)}
                disabled={loading}
                className="mt-0.5 rounded border-input accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.pdfSizeBytes ? `${(doc.pdfSizeBytes / 1024).toFixed(0)} KB` : ""}
                  {doc.generatedAt ? ` — ${new Date(doc.generatedAt).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
        <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={loading}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleGenerate} disabled={loading || selectedIds.size === 0}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Gerando dossiê...
            </>
          ) : (
            <>
              <BookOpen className="h-4 w-4 mr-1" />
              Gerar e Baixar PDF
            </>
          )}
        </Button>
      </div>
    </Dialog>
  );
}
