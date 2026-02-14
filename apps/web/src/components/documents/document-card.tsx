import { Link } from "react-router-dom";
import { FileText, Trash2, RefreshCw, Loader2, Check } from "lucide-react";
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
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
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
  selectionMode,
  selected,
  onToggleSelect,
}: DocumentCardProps) {
  const status = statusConfig[document.status] ?? statusConfig.error;
  const isSelectable = selectionMode && document.status === "completed";

  const formattedDate = document.generatedAt
    ? new Date(document.generatedAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const cardContent = (
    <div className="flex items-start gap-3">
      {selectionMode && (
        <div className="mt-0.5 shrink-0">
          {isSelectable ? (
            selected ? (
              <div className="h-5 w-5 rounded border-2 border-primary bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            ) : (
              <div className="h-5 w-5 rounded border-2 border-muted-foreground/30" />
            )
          ) : (
            <div className="h-5 w-5" />
          )}
        </div>
      )}
      <FileText className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
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
      {!selectionMode && (
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
      )}
    </div>
  );

  if (isSelectable) {
    return (
      <Card
        className={`cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
        onClick={onToggleSelect}
      >
        <CardContent className="p-4">{cardContent}</CardContent>
      </Card>
    );
  }

  if (selectionMode) {
    return (
      <Card className="opacity-50">
        <CardContent className="p-4">{cardContent}</CardContent>
      </Card>
    );
  }

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
