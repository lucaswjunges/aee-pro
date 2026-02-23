import { Sparkles, Code } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeToggleProps {
  mode: "simple" | "advanced";
  onModeChange: (mode: "simple" | "advanced") => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center bg-muted rounded-md p-0.5">
      <button
        onClick={() => onModeChange("simple")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors",
          mode === "simple"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sparkles className="h-3 w-3" />
        Simples
      </button>
      <button
        onClick={() => onModeChange("advanced")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors",
          mode === "advanced"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Code className="h-3 w-3" />
        Avançado
      </button>
    </div>
  );
}
