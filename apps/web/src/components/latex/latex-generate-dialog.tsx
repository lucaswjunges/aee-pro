import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { LATEX_DOCUMENT_TYPES } from "@aee-pro/shared";
import type { LatexDocument } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HeatSlider } from "./heat-slider";
import { SizeSlider } from "./size-slider";
import { api } from "@/lib/api";

interface LatexGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onGenerated: () => void;
}

export function LatexGenerateDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onGenerated,
}: LatexGenerateDialogProps) {
  const [documentType, setDocumentType] = useState<string>(LATEX_DOCUMENT_TYPES[0].slug);
  const [heatLevel, setHeatLevel] = useState(3);
  const [sizeLevel, setSizeLevel] = useState(3);
  const [customPrompt, setCustomPrompt] = useState("");
  const [unlimitedTokens, setUnlimitedTokens] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setSubmitting(true);
    setError(null);

    // Fire the request — the API processes synchronously but we don't need to wait.
    // Close the dialog after a short delay so the user sees "Gerando..." feedback,
    // then the document list will show the new doc with its status.
    const requestPromise = api.post<LatexDocument>("/latex-documents/generate", {
      studentId,
      documentType,
      heatLevel,
      sizeLevel,
      customPrompt: customPrompt.trim() || undefined,
      unlimitedTokens,
    });

    // Close dialog after 2s and refresh list — don't wait for the full response
    setTimeout(() => {
      onGenerated();
      handleClose();
    }, 2000);

    // Still handle errors if the request fails quickly
    const res = await requestPromise;
    if (!res.success) {
      // Only show error if dialog is still open (within the 2s window)
      setSubmitting(false);
      setError(res.error ?? "Erro desconhecido");
    } else {
      // Request completed — refresh list again to get final status
      onGenerated();
    }
  };

  const handleClose = () => {
    setSubmitting(false);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogHeader>
        <DialogTitle>Gerar Documento LaTeX</DialogTitle>
        <DialogDescription>
          Documento profissional em PDF para {studentName}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Document type selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tipo de Documento</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          >
            {LATEX_DOCUMENT_TYPES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Heat slider */}
        <HeatSlider value={heatLevel} onChange={setHeatLevel} disabled={submitting} />

        {/* Size slider */}
        <SizeSlider value={sizeLevel} onChange={setSizeLevel} disabled={submitting} />

        {/* Unlimited tokens */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={unlimitedTokens}
            onChange={(e) => setUnlimitedTokens(e.target.checked)}
            disabled={submitting}
            className="rounded border-input"
          />
          <span className="text-sm">Usar máximo de tokens</span>
          <span className="text-xs text-muted-foreground">(documento mais completo, consome mais)</span>
        </label>

        {/* Custom prompt */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Instruções adicionais <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            disabled={submitting}
            placeholder="Ex: Incluir seção sobre comunicação alternativa. Destacar habilidades em artes..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50 resize-none"
          />
        </div>

        {/* Token usage hint */}
        {(heatLevel + sizeLevel) >= 8 && !unlimitedTokens && (
          <p className="text-xs text-muted-foreground">
            Combinação alta — consome mais tokens. Providers gratuitos podem truncar o resultado.
          </p>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={submitting}>
            {submitting ? "Gerando..." : "Gerar Documento"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
