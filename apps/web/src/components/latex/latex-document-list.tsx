import type { LatexDocument } from "@aee-pro/shared";
import { LatexDocumentCard } from "./latex-document-card";

interface LatexDocumentListProps {
  documents: LatexDocument[];
  studentId: string;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  regeneratingId: string | null;
}

export function LatexDocumentList({
  documents,
  studentId,
  onDelete,
  onRegenerate,
  regeneratingId,
}: LatexDocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Nenhum documento gerado ainda.
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Diferente dos documentos de texto, aqui a IA gera um PDF formatado com tabelas,
          cabeçalhos e layout profissional — pronto para imprimir ou enviar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <LatexDocumentCard
          key={doc.id}
          document={doc}
          studentId={studentId}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          regenerating={regeneratingId === doc.id}
        />
      ))}
    </div>
  );
}
