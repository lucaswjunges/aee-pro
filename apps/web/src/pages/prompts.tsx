import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, FileText, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { Prompt } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PromptForm } from "@/components/prompts/prompt-form";
import { api } from "@/lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  avaliacao: "Avaliação",
  planejamento: "Planejamento",
  registro: "Registro",
  relatorio: "Relatório",
  custom: "Personalizado",
};

function PromptCard({
  prompt,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onReset,
  deleting,
  resetting,
}: {
  prompt: Prompt;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onReset?: () => void;
  deleting?: boolean;
  resetting?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4 space-y-2">
        {/* Row 1: Name */}
        <p className="font-medium leading-snug">{prompt.name}</p>

        {/* Row 2: Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={prompt.isBuiltIn ? "outline" : "secondary"}>
            {CATEGORY_LABELS[prompt.category ?? "custom"] ?? prompt.category}
          </Badge>
          {prompt.isBuiltIn && (
            <Badge variant="secondary" className="text-xs">Built-in</Badge>
          )}
        </div>

        {/* Row 3: Description */}
        {prompt.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {prompt.description}
          </p>
        )}

        {/* Row 4: Action buttons - always aligned left */}
        <div className="flex items-center gap-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="gap-1 text-xs px-2 h-8"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {expanded ? "Ocultar" : "Ver template"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="gap-1 text-xs px-2 h-8"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={resetting}
              className="gap-1 text-xs px-2 h-8"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              Restaurar
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="gap-1 text-xs px-2 h-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </Button>
          )}
        </div>

        {/* Expanded template */}
        {expanded && prompt.promptTemplate && (
          <pre className="p-3 bg-muted rounded-md text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">
            {prompt.promptTemplate}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadPrompts = async () => {
    setLoading(true);
    const res = await api.get<Prompt[]>("/prompts");
    if (res.success && res.data) {
      setPrompts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este prompt?")) return;
    setDeleting(id);
    const res = await api.delete(`/prompts/${id}`);
    if (res.success) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    }
    setDeleting(null);
  };

  const handleReset = async (id: string) => {
    if (!confirm("Restaurar este prompt ao template original? Suas alterações serão perdidas.")) return;
    setResetting(id);
    const res = await api.post(`/prompts/${id}/reset`, {});
    if (res.success) {
      loadPrompts();
    }
    setResetting(null);
  };

  const handleFormSaved = () => {
    setShowForm(false);
    setEditingPrompt(undefined);
    loadPrompts();
  };

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setShowForm(true);
  };

  const handleNewPrompt = () => {
    setEditingPrompt(undefined);
    setShowForm(true);
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">
          {editingPrompt ? "Editar Prompt" : "Novo Prompt"}
        </h1>
        <PromptForm
          prompt={editingPrompt}
          onSaved={handleFormSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingPrompt(undefined);
          }}
        />
      </div>
    );
  }

  const builtIn = prompts.filter((p) => p.isBuiltIn);
  const custom = prompts.filter((p) => !p.isBuiltIn);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prompts</h1>
        <Button onClick={handleNewPrompt} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo Prompt
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          {/* Custom prompts */}
          {custom.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Meus Prompts</h2>
              {custom.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  expanded={expanded.has(prompt.id)}
                  onToggleExpand={() => toggleExpand(prompt.id)}
                  onEdit={() => handleEdit(prompt)}
                  onDelete={() => handleDelete(prompt.id)}
                  deleting={deleting === prompt.id}
                />
              ))}
            </div>
          )}

          {/* Built-in prompts */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              Prompts Built-in ({builtIn.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              Prompts profissionais incluídos no AEE+ PRO. Você pode editar o template e restaurar o original a qualquer momento.
            </p>
            {builtIn.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                expanded={expanded.has(prompt.id)}
                onToggleExpand={() => toggleExpand(prompt.id)}
                onEdit={() => handleEdit(prompt)}
                onReset={() => handleReset(prompt.id)}
                resetting={resetting === prompt.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
