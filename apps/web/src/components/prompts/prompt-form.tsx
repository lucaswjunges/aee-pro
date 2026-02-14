import { useState } from "react";
import type { Prompt } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface PromptFormProps {
  prompt?: Prompt;
  onSaved: () => void;
  onCancel: () => void;
}

export function PromptForm({ prompt, onSaved, onCancel }: PromptFormProps) {
  const isEdit = !!prompt;
  const isBuiltIn = prompt?.isBuiltIn ?? false;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(prompt?.name ?? "");
  const [description, setDescription] = useState(prompt?.description ?? "");
  const [category, setCategory] = useState(prompt?.category ?? "custom");
  const [promptTemplate, setPromptTemplate] = useState(prompt?.promptTemplate ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = isBuiltIn
      ? { promptTemplate }
      : { name, description, category, promptTemplate, requiredFields: JSON.stringify(["name"]) };

    const res = isEdit
      ? await api.put(`/prompts/${prompt!.id}`, payload)
      : await api.post("/prompts", payload);

    setLoading(false);

    if (res.success) {
      onSaved();
    } else {
      setError(res.error ?? "Erro ao salvar prompt");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isBuiltIn ? `Editar Prompt: ${prompt?.name}` : isEdit ? "Editar Prompt" : "Novo Prompt"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isBuiltIn && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              Este é um prompt built-in. Você pode editar o template livremente.
              Se quiser voltar ao original, use o botão "Restaurar Original" na lista de prompts.
            </div>
          )}

          {!isBuiltIn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="promptName">Nome *</Label>
                <Input
                  id="promptName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ex: Relatório de Progresso Mensal"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="promptDescription">Descrição</Label>
                <Input
                  id="promptDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrição do que este prompt gera"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promptCategory">Categoria</Label>
                <Select
                  id="promptCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="avaliacao">Avaliação</option>
                  <option value="planejamento">Planejamento</option>
                  <option value="registro">Registro</option>
                  <option value="relatorio">Relatório</option>
                  <option value="custom">Personalizado</option>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="promptTemplate">Template do Prompt *</Label>
            <Textarea
              id="promptTemplate"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              required
              rows={16}
              placeholder={`Escreva o prompt que será enviado à IA. Use {{campo}} para inserir dados do aluno.

Campos disponíveis: {{name}}, {{dateOfBirth}}, {{grade}}, {{school}}, {{diagnosis}}, {{diagnosticoCid}}, {{classificacao}}, {{teacherName}}, {{profRegular}}, {{dificuldadesIniciais}}, {{potencialidades}}, {{barreiras}}, etc.

Exemplo:
Com base nos dados do aluno {{name}}, matriculado no {{grade}} da escola {{school}}, com diagnóstico de {{diagnosis}}, elabore um relatório...`}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{campo}}"} para inserir dados do aluno automaticamente. Campos não preenchidos aparecerão como "não informado".
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
