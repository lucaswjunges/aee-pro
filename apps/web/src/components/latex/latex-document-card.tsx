import { Link } from "react-router-dom";
import { Trash2, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import type { LatexDocument } from "@aee-pro/shared";
import { HEAT_LEVELS, SIZE_LEVELS } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PdfIcon } from "@/components/ui/pdf-icon";

interface LatexDocumentCardProps {
  document: LatexDocument;
  studentId: string;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  regenerating?: boolean;
}

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { label: "Concluído", variant: "success" },
  generating: { label: "Gerando...", variant: "warning" },
  compiling: { label: "Compilando...", variant: "warning" },
  compile_error: { label: "Erro compilação", variant: "destructive" },
  error: { label: "Erro", variant: "destructive" },
};

export function LatexDocumentCard({
  document,
  studentId,
  onDelete,
  onRegenerate,
  regenerating,
}: LatexDocumentCardProps) {
  const status = statusConfig[document.status] ?? statusConfig.error;
  const isProcessing = document.status === "generating" || document.status === "compiling";
  const isBusy = regenerating || isProcessing;
  const heatName = HEAT_LEVELS.find((h) => h.level === document.heatLevel)?.name ?? `${document.heatLevel}`;
  const sizeName = SIZE_LEVELS.find((s) => s.level === document.sizeLevel)?.name ?? `${document.sizeLevel}`;
  const dateSource = isProcessing ? document.createdAt : document.generatedAt;
  const dateLabel = isProcessing ? "Iniciado em " : "";
  const formattedDate = dateSource
    ? dateLabel + new Date(dateSource).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Link
            to={`/alunos/${studentId}/documentos-latex/${document.id}`}
            className="flex items-start gap-3 min-w-0 flex-1"
          >
            <div className="relative shrink-0 mt-0.5">
              <PdfIcon size="sm" />
              {document.status === "compile_error" && (
                <AlertTriangle className="h-3 w-3 text-destructive absolute -bottom-1 -right-1" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium break-words leading-snug">{document.title}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline" className="text-[10px]">
                  {heatName}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {sizeName}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {formattedDate && (
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                )}
                {document.pdfSizeBytes && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(document.pdfSizeBytes / 1024)} KB
                  </span>
                )}
              </div>
              {document.aiProvider && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {document.aiProvider} / {document.aiModel}
                </p>
              )}
            </div>
          </Link>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRegenerate(document.id)}
              disabled={isBusy}
              title="Regenerar"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm("Tem certeza que deseja excluir este documento LaTeX?")) {
                  onDelete(document.id);
                }
              }}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
