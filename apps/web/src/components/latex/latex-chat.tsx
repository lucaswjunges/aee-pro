import { useState } from "react";
import { Send, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageGallery } from "./image-gallery";

interface LatexChatProps {
  onSendInstruction: (instruction: string) => Promise<void>;
  disabled?: boolean;
}

export function LatexChat({ onSendInstruction, disabled }: LatexChatProps) {
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [history, setHistory] = useState<{ text: string; status: "sent" | "done" | "error" }[]>([]);

  const handleSend = async () => {
    if (!instruction.trim() || sending) return;

    const text = instruction.trim();
    setInstruction("");
    setSending(true);
    setHistory((prev) => [...prev, { text, status: "sent" }]);

    try {
      await onSendInstruction(text);
      setHistory((prev) =>
        prev.map((h, i) => (i === prev.length - 1 ? { ...h, status: "done" as const } : h)),
      );
    } catch {
      setHistory((prev) =>
        prev.map((h, i) => (i === prev.length - 1 ? { ...h, status: "error" as const } : h)),
      );
    }
    setSending(false);
  };

  const handleSelectImage = (filename: string, displayName: string) => {
    setInstruction((prev) => {
      const prefix = prev.trim() ? prev.trim() + " " : "";
      return `${prefix}adicione a imagem ${filename} (${displayName})`;
    });
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Editar com IA</label>

      {history.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {history.map((entry, i) => (
            <div
              key={i}
              className={`text-xs rounded p-2 ${
                entry.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : entry.status === "done"
                    ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {entry.text}
              {entry.status === "sent" && (
                <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />
              )}
              {entry.status === "done" && " — Aplicado"}
              {entry.status === "error" && " — Erro"}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setGalleryOpen(true)}
          disabled={disabled || sending}
          title="Figurinhas e imagens"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ex: Adicione a imagem urso-pelucia.png na capa"
          disabled={disabled || sending}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || sending || !instruction.trim()}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Descreva a mudança desejada. Use o botão de figurinhas para inserir imagens no documento.
      </p>

      <ImageGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSelectImage={handleSelectImage}
      />
    </div>
  );
}
