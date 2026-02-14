import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Document } from "@aee-pro/shared";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface BatchEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: Document[];
  onCompleted: () => void;
}

type EditStatus = Record<string, "pending" | "editing" | "completed" | "error">;

export function BatchEditDialog({
  open,
  onOpenChange,
  documents,
  onCompleted,
}: BatchEditDialogProps) {
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [editStatus, setEditStatus] = useState<EditStatus>({});

  const handleClose = (value: boolean) => {
    if (running) return;
    setInstruction("");
    setEditStatus({});
    onOpenChange(value);
  };

  const handleEditBatch = async () => {
    if (!instruction.trim() || documents.length === 0) return;
    setRunning(true);

    const initialStatus: EditStatus = {};
    for (const doc of documents) {
      initialStatus[doc.id] = "pending";
    }
    setEditStatus(initialStatus);

    let hasError = false;

    for (const doc of documents) {
      setEditStatus((prev) => ({ ...prev, [doc.id]: "editing" }));

      const res = await api.post(`/documents/${doc.id}/edit-ai`, {
        instruction: instruction.trim(),
      });

      if (res.success) {
        setEditStatus((prev) => ({ ...prev, [doc.id]: "completed" }));
      } else {
        setEditStatus((prev) => ({ ...prev, [doc.id]: "error" }));
        hasError = true;
      }
    }

    onCompleted();
    setRunning(false);

    if (!hasError) {
      setTimeout(() => handleClose(false), 1000);
    }
  };

  const completedCount = Object.values(editStatus).filter((s) => s === "completed").length;
  const errorCount = Object.values(editStatus).filter((s) => s === "error").length;

  const statusIcon = (docId: string) => {
    const status = editStatus[docId];
    if (!status) return null;
    switch (status) {
      case "editing":
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogHeader>
        <DialogTitle>Editar com IA</DialogTitle>
        <DialogDescription>
          {documents.length} {documents.length === 1 ? "documento selecionado" : "documentos selecionados"}
        </DialogDescription>
      </DialogHeader>

      <div className="mb-4">
        <label className="text-sm font-medium mb-1.5 block">Instrução para a IA</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={running}
          placeholder='Ex: "Deixe mais detalhado", "Resuma em tópicos", "Corrija a formatação"'
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-y"
        />
      </div>

      {running && (
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Editando... {completedCount}/{documents.length} concluídos
            {errorCount > 0 && `, ${errorCount} com erro`}
          </span>
        </div>
      )}

      <div className="space-y-2 max-h-[30vh] overflow-y-auto">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 p-3 rounded-lg border text-sm"
          >
            <div className="shrink-0">
              {statusIcon(doc.id) ?? (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
              )}
            </div>
            <span className="flex-1 min-w-0 truncate">{doc.title}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end mt-4 pt-3 border-t gap-2">
        <Button variant="outline" size="sm" onClick={() => handleClose(false)} disabled={running}>
          {running ? "Aguarde..." : "Cancelar"}
        </Button>
        {!running && (
          <Button
            size="sm"
            onClick={handleEditBatch}
            disabled={!instruction.trim()}
          >
            Editar {documents.length === 1 ? "documento" : `${documents.length} documentos`}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
