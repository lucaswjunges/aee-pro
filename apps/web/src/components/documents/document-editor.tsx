import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface DocumentEditorProps {
  documentId: string;
  initialContent: string;
  onSaved: (content: string) => void;
}

export function DocumentEditor({ documentId, initialContent, onSaved }: DocumentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hasChanges = content !== initialContent;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const res = await api.put(`/documents/${documentId}`, { content });
    setSaving(false);

    if (res.success) {
      setMsg("Documento salvo!");
      onSaved(content);
    } else {
      setMsg(res.error ?? "Erro ao salvar");
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={20}
        className="font-mono text-sm leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
