import { AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompilationErrorProps {
  error: string;
  onFixWithAI?: () => void;
  fixing?: boolean;
}

export function CompilationError({ error, onFixWithAI, fixing }: CompilationErrorProps) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-destructive">Erro de Compilação LaTeX</p>
          <p className="text-xs text-muted-foreground mt-1">
            O código LaTeX contém erros que impediram a geração do PDF.
          </p>
        </div>
      </div>
      <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-words font-mono">
        {error}
      </pre>
      {onFixWithAI && (
        <Button
          size="sm"
          variant="outline"
          onClick={onFixWithAI}
          disabled={fixing}
        >
          <Wand2 className="h-4 w-4 mr-1" />
          {fixing ? "Corrigindo..." : "Corrigir com IA"}
        </Button>
      )}
    </div>
  );
}
