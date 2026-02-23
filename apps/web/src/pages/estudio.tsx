import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  Sparkles,
  Trash2,
  Search,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { WorkspaceProject } from "@aee-pro/shared";

interface ProjectWithMeta extends WorkspaceProject {
  fileCount?: number;
  studentName?: string;
}

export function EstudioPage() {
  const [projects, setProjects] = useState<ProjectWithMeta[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStudentId, setNewStudentId] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const loadProjects = useCallback(async () => {
    const res = await api.get<ProjectWithMeta[]>(
      "/workspace/projects"
    );
    if (res.success && res.data) {
      setProjects(res.data);
    }
    setLoading(false);
  }, []);

  const loadStudents = useCallback(async () => {
    const res = await api.get<{ id: string; name: string }[]>("/students");
    if (res.success && res.data) {
      setStudents(res.data);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadStudents();
  }, [loadProjects, loadStudents]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await api.post<WorkspaceProject & { conversationId: string }>(
      "/workspace/projects",
      {
        name: newName.trim(),
        studentId: newStudentId || undefined,
      }
    );
    if (res.success && res.data) {
      navigate(`/estudio/${res.data.id}`);
    }
    setCreating(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Excluir este projeto e todos os seus arquivos?")) return;
    const res = await api.delete(`/workspace/projects/${id}`);
    if (res.success) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term) ||
      p.studentName?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Estúdio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie documentos, jogos e materiais com ajuda da IA
          </p>
        </div>
        <Button onClick={() => setShowNewForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Projeto
        </Button>
      </div>

      {showNewForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Nome do Projeto
                </label>
                <Input
                  placeholder="Ex: Documentos do João Pedro, Jogo de Matemática..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Vincular a aluno (opcional)
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={newStudentId}
                  onChange={(e) => setNewStudentId(e.target.value)}
                >
                  <option value="">Nenhum aluno</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? "Criando..." : "Criar Projeto"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewForm(false);
                    setNewName("");
                    setNewStudentId("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && projects.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">
              {search ? "Nenhum projeto encontrado" : "Nenhum projeto ainda"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? "Tente outro termo de busca"
                : "Crie seu primeiro projeto para começar a usar o Estúdio"}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setShowNewForm(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Criar Projeto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <Link key={project.id} to={`/estudio/${project.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer group h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                      title="Excluir projeto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {project.studentId && (
                      <Badge variant="secondary" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        {project.studentName || "Aluno vinculado"}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    Atualizado em{" "}
                    {new Date(project.updatedAt).toLocaleDateString("pt-BR")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
