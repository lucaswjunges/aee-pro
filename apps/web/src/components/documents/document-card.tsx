import { Link } from "react-router-dom";
import { FileText, Trash2, RefreshCw, Loader2 } from "lucide-react";
import type { Document } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface DocumentCardProps {
  document: Document;
  studentId: string;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  regenerating?: boolean;
}

const statusConfig = {
  completed: { label: "Concluído", variant: "success" as const },
  generating: { label: "Gerando...", variant: "warning" as const },
  error: { label: "Erro", variant: "destructive" as const },
};

export function DocumentCard({
  document,
  studentId,
  onDelete,
  onRegenerate,
  regenerating,
}: DocumentCardProps) {
  const status = statusConfig[document.status] ?? statusConfig.error;

  const formattedDate = document.generatedAt
    ? new Date(document.generatedAt).toLocaleDateString("pt-BR", {
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
            to={`/alunos/${studentId}/documentos/${document.id}`}
            className="flex items-start gap-3 min-w-0 flex-1"
          >
            <FileText className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-medium break-words leading-snug">{document.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={status.variant}>{status.label}</Badge>
                {formattedDate && (
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                )}
              </div>
              {document.aiProvider && (
                <p className="text-xs text-muted-foreground mt-1">
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
              disabled={regenerating}
              title="Regenerar"
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm("Tem certeza que deseja excluir este documento?")) {
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
