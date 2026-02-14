import type { Document } from "@aee-pro/shared";
import { DocumentCard } from "./document-card";

interface DocumentListProps {
  documents: Document[];
  studentId: string;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  regeneratingId: string | null;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function DocumentList({
  documents,
  studentId,
  onDelete,
  onRegenerate,
  regeneratingId,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Nenhum documento gerado ainda.</p>
        <p className="mt-2">
          Clique em "Gerar Novo Documento" para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          studentId={studentId}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          regenerating={regeneratingId === doc.id}
          selectionMode={selectionMode}
          selected={selectedIds?.has(doc.id)}
          onToggleSelect={() => onToggleSelect?.(doc.id)}
        />
      ))}
    </div>
  );
}
