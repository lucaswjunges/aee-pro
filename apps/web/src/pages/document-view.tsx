import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Eye, FileDown, Printer } from "lucide-react";
import type { Document } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentEditor } from "@/components/documents/document-editor";
import { api } from "@/lib/api";

export function DocumentViewPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!docId) return;
    api.get<Document>(`/documents/${docId}`).then((res) => {
      if (res.success && res.data) setDocument(res.data);
      setLoading(false);
    });
  }, [docId]);

  const handleExportDocx = async () => {
    if (!docId) return;
    setExporting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/documents/${docId}/export/docx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document?.title ?? "documento"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar documento.");
    }
    setExporting(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`/alunos/${id}/documentos`}>Voltar</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = {
    completed: { label: "Concluído", variant: "success" as const },
    generating: { label: "Gerando...", variant: "warning" as const },
    error: { label: "Erro", variant: "destructive" as const },
  };

  const status = statusConfig[document.status] ?? statusConfig.error;

  return (
    <div className="space-y-4">
      {/* Header row: back + title */}
      <div className="flex items-start gap-3 print:hidden">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
          <Link to={`/alunos/${id}/documentos`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold break-words">{document.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={status.variant}>{status.label}</Badge>
            {document.generatedAt && (
              <span className="text-xs sm:text-sm text-muted-foreground">
                {new Date(document.generatedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons - separate row for mobile */}
      {document.status === "completed" && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportDocx}
            disabled={exporting}
          >
            <FileDown className="h-4 w-4 mr-1" />
            {exporting ? "Exportando..." : "DOCX"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? (
              <>
                <Eye className="h-4 w-4 mr-1" />
                Visualizar
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </>
            )}
          </Button>
        </div>
      )}

      {/* Print header - only visible when printing */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-xl font-bold text-center">{document.title}</h1>
        {document.generatedAt && (
          <p className="text-sm text-center text-gray-500 mt-1">
            Gerado em: {new Date(document.generatedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      {document.status === "error" && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive print:hidden">
          Erro na geração: {document.content}
        </div>
      )}

      {document.status === "completed" && (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="print:hidden">
            <CardTitle className="text-base">
              {editing ? "Editando documento" : "Conteúdo do documento"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="print:hidden">
                <DocumentEditor
                  documentId={document.id}
                  initialContent={document.content ?? ""}
                  onSaved={(newContent) => {
                    setDocument({ ...document, content: newContent });
                  }}
                />
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed break-words print:text-[12pt] print:leading-[1.6]">
                {document.content}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {document.status === "generating" && (
        <div className="text-center py-12 text-muted-foreground print:hidden">
          <p className="text-lg">Documento sendo gerado...</p>
          <p className="mt-2">Aguarde alguns instantes e recarregue a página.</p>
        </div>
      )}
    </div>
  );
}
