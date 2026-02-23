import {
  FileText,
  Gamepad2,
  BookOpen,
  Presentation,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QUICK_ACTIONS } from "@aee-pro/shared";

const ICONS: Record<string, React.ElementType> = {
  "file-text": FileText,
  "gamepad-2": Gamepad2,
  "book-open": BookOpen,
  presentation: Presentation,
  pencil: Pencil,
};

interface QuickActionsProps {
  onAction: (prompt: string) => void;
}

export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {QUICK_ACTIONS.map((action) => {
        const Icon = ICONS[action.icon] || FileText;
        return (
          <Card
            key={action.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onAction(action.prompt)}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-sm">{action.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {action.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
