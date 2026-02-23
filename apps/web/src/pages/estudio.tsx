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
  FileText,
  ClipboardList,
  BookOpen,
  MessageSquareText,
  Puzzle,
  Package,
  GraduationCap,
  CalendarClock,
  TrendingUp,
  Heart,
  Presentation,
  FileStack,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { WorkspaceProject } from "@aee-pro/shared";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: "violet" | "blue" | "indigo" | "cyan" | "emerald" | "green" | "amber" | "orange" | "rose" | "pink" | "fuchsia" | "slate";
  prompt: string;
}

const COLOR_CLASSES: Record<Template["color"], { card: string; border: string; hoverBorder: string; iconBg: string; badge: string }> = {
  violet:  { card: "from-violet-500/10 to-violet-600/5",  border: "border-violet-200 dark:border-violet-800",  hoverBorder: "hover:border-violet-400 dark:hover:border-violet-600",  iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300",  badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
  blue:    { card: "from-blue-500/10 to-blue-600/5",      border: "border-blue-200 dark:border-blue-800",      hoverBorder: "hover:border-blue-400 dark:hover:border-blue-600",      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  indigo:  { card: "from-indigo-500/10 to-indigo-600/5",  border: "border-indigo-200 dark:border-indigo-800",  hoverBorder: "hover:border-indigo-400 dark:hover:border-indigo-600",  iconBg: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",  badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
  cyan:    { card: "from-cyan-500/10 to-cyan-600/5",      border: "border-cyan-200 dark:border-cyan-800",      hoverBorder: "hover:border-cyan-400 dark:hover:border-cyan-600",      iconBg: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-300",      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
  emerald: { card: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-200 dark:border-emerald-800", hoverBorder: "hover:border-emerald-400 dark:hover:border-emerald-600", iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  green:   { card: "from-green-500/10 to-green-600/5",    border: "border-green-200 dark:border-green-800",    hoverBorder: "hover:border-green-400 dark:hover:border-green-600",    iconBg: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",    badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  amber:   { card: "from-amber-500/10 to-amber-600/5",    border: "border-amber-200 dark:border-amber-800",    hoverBorder: "hover:border-amber-400 dark:hover:border-amber-600",    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300",    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  orange:  { card: "from-orange-500/10 to-orange-600/5",  border: "border-orange-200 dark:border-orange-800",  hoverBorder: "hover:border-orange-400 dark:hover:border-orange-600",  iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  rose:    { card: "from-rose-500/10 to-rose-600/5",      border: "border-rose-200 dark:border-rose-800",      hoverBorder: "hover:border-rose-400 dark:hover:border-rose-600",      iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-300",      badge: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300" },
  pink:    { card: "from-pink-500/10 to-pink-600/5",      border: "border-pink-200 dark:border-pink-800",      hoverBorder: "hover:border-pink-400 dark:hover:border-pink-600",      iconBg: "bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300",      badge: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300" },
  fuchsia: { card: "from-fuchsia-500/10 to-fuchsia-600/5", border: "border-fuchsia-200 dark:border-fuchsia-800", hoverBorder: "hover:border-fuchsia-400 dark:hover:border-fuchsia-600", iconBg: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900 dark:text-fuchsia-300", badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900 dark:text-fuchsia-300" },
  slate:   { card: "from-slate-500/10 to-slate-600/5",    border: "border-slate-200 dark:border-slate-700",    hoverBorder: "hover:border-slate-400 dark:hover:border-slate-500",    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const TEMPLATES: Template[] = [
  {
    id: "pei-completo",
    name: "PEI Completo",
    description: "Plano Educacional Individualizado com metas e estratégias",
    icon: FileText,
    color: "violet",
    prompt: "Gere um PEI completo para o aluno vinculado a este projeto. Inclua: dados do aluno, diagnóstico, objetivos gerais e específicos, metas SMART, estratégias pedagógicas, adaptações curriculares, recursos necessários, cronograma e critérios de avaliação. Use formato profissional com seções bem definidas.",
  },
  {
    id: "anamnese",
    name: "Anamnese Detalhada",
    description: "Avaliação inicial completa do aluno",
    icon: ClipboardList,
    color: "blue",
    prompt: "Crie uma anamnese detalhada profissional para o aluno vinculado. Inclua: identificação, histórico gestacional e de desenvolvimento, marcos motores e de linguagem, histórico escolar, aspectos familiares e sociais, comportamento, saúde, medicações, terapias, e observações relevantes. Formato formal para arquivo escolar.",
  },
  {
    id: "estudo-de-caso",
    name: "Estudo de Caso",
    description: "Análise aprofundada com fundamentação teórica",
    icon: BookOpen,
    color: "indigo",
    prompt: "Elabore um estudo de caso completo sobre o aluno vinculado. Inclua: introdução com contextualização, fundamentação teórica sobre o diagnóstico, metodologia de avaliação, análise do desenvolvimento por dimensões (cognitivo, motor, social, linguagem), discussão dos resultados, propostas de intervenção e referências bibliográficas.",
  },
  {
    id: "parecer-descritivo",
    name: "Parecer Descritivo",
    description: "Parecer pedagógico com análise por dimensão",
    icon: MessageSquareText,
    color: "cyan",
    prompt: "Gere um parecer descritivo completo do aluno vinculado. Analise cada dimensão do desenvolvimento: cognitiva, motora, socioafetiva, linguagem e comunicação, autonomia e vida diária. Para cada dimensão, descreva o nível atual, avanços observados, dificuldades persistentes e estratégias recomendadas. Conclua com uma síntese geral e encaminhamentos.",
  },
  {
    id: "jogo-educativo",
    name: "Jogo Educativo Imprimível",
    description: "Jogo pedagógico adaptado com regras e peças",
    icon: Puzzle,
    color: "emerald",
    prompt: "Crie um jogo educativo imprimível adaptado para o aluno vinculado. Inclua: nome do jogo, objetivo pedagógico, materiais necessários, regras detalhadas, variações por nível de dificuldade e as peças/tabuleiro em LaTeX prontos para impressão. O jogo deve trabalhar habilidades específicas relacionadas ao diagnóstico do aluno.",
  },
  {
    id: "kit-atividades",
    name: "Kit de Atividades",
    description: "Conjunto de atividades adaptadas por nível",
    icon: Package,
    color: "green",
    prompt: "Crie um kit com 5 atividades adaptadas para o aluno vinculado. Cada atividade deve ter: título, objetivo, materiais, passo a passo, adaptações por nível (básico, intermediário, avançado), critérios de avaliação e dicas para o professor. As atividades devem ser progressivas e trabalhar diferentes habilidades.",
  },
  {
    id: "material-aula",
    name: "Material de Aula Adaptado",
    description: "Sequência didática com adaptações inclusivas",
    icon: GraduationCap,
    color: "amber",
    prompt: "Crie um material de aula adaptado para incluir o aluno vinculado na turma regular. Inclua: tema da aula, objetivos (gerais e específicos para o aluno), conteúdo adaptado, sequência didática com momentos de inclusão, recursos visuais, atividades diferenciadas e avaliação adaptada.",
  },
  {
    id: "rotina-visual",
    name: "Rotina Visual",
    description: "Quadro de rotina visual com imagens descritivas",
    icon: CalendarClock,
    color: "orange",
    prompt: "Gere uma rotina visual detalhada para o aluno vinculado. Crie um quadro de rotina com: horários, atividades do dia (chegada, roda, atividades, lanche, parque, saída), descrição visual de cada momento, dicas de transição entre atividades e adaptações sensoriais. Formato em LaTeX pronto para imprimir e plastificar.",
  },
  {
    id: "relatorio-evolucao",
    name: "Relatório de Evolução",
    description: "Relatório periódico com análise de progresso",
    icon: TrendingUp,
    color: "rose",
    prompt: "Gere um relatório de evolução do aluno vinculado referente ao período atual. Compare o desenvolvimento nas dimensões cognitiva, motora, social, linguagem e autonomia. Para cada área, indique: objetivos trabalhados, estratégias utilizadas, avanços observados, dificuldades persistentes e metas para o próximo período.",
  },
  {
    id: "relatorio-familia",
    name: "Relatório para Família",
    description: "Devolutiva acessível para pais e responsáveis",
    icon: Heart,
    color: "pink",
    prompt: "Crie um relatório para a família do aluno vinculado. Use linguagem acessível e acolhedora (evite jargões técnicos). Descreva: como o aluno está na escola, o que ele tem aprendido, suas conquistas recentes, no que estamos trabalhando, como a família pode ajudar em casa e próximos passos. Tom positivo e encorajador.",
  },
  {
    id: "apresentacao-reuniao",
    name: "Apresentação para Reunião",
    description: "Slides profissionais para reunião pedagógica",
    icon: Presentation,
    color: "fuchsia",
    prompt: "Crie uma apresentação em LaTeX/Beamer profissional para reunião pedagógica sobre o aluno vinculado. Slides: 1) Capa, 2) Dados do aluno, 3) Diagnóstico e características, 4) Objetivos do PEI, 5) Estratégias utilizadas, 6) Evolução por dimensão, 7) Próximos passos, 8) Orientações para a equipe. Design limpo e visual.",
  },
  {
    id: "tcc-aee",
    name: "TCC sobre AEE",
    description: "Trabalho acadêmico com estrutura ABNT",
    icon: FileStack,
    color: "slate",
    prompt: "Gere um TCC completo sobre AEE em LaTeX com formatação ABNT. Estrutura: capa, folha de rosto, resumo, abstract, sumário, introdução (justificativa, objetivos, metodologia), referencial teórico (legislação inclusiva, AEE, papel do professor especializado), desenvolvimento (estudo de caso do aluno vinculado), considerações finais e referências bibliográficas atualizadas.",
  },
];

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
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);
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

  const handleTemplateClick = async (template: Template) => {
    if (creatingTemplate) return;
    setCreatingTemplate(template.id);
    try {
      const res = await api.post<WorkspaceProject & { conversationId: string }>(
        "/workspace/projects",
        { name: template.name }
      );
      if (res.success && res.data) {
        sessionStorage.setItem(
          `estudio-template-prompt:${res.data.id}`,
          template.prompt
        );
        navigate(`/estudio/${res.data.id}`);
      }
    } finally {
      setCreatingTemplate(null);
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

      {/* Projects section (before templates) */}
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

      {!loading && projects.length > 0 && (
        <h2 className="text-sm font-semibold text-muted-foreground">
          Seus Projetos
        </h2>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : projects.length > 0 && filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">
              Nenhum projeto encontrado
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Tente outro termo de busca
            </p>
          </CardContent>
        </Card>
      ) : (
        projects.length > 0 && (
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
        )
      )}

      {/* Templates */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          Comece com um Template
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TEMPLATES.map((template) => {
            const colors = COLOR_CLASSES[template.color];
            const Icon = template.icon;
            const isCreating = creatingTemplate === template.id;
            return (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template)}
                disabled={!!creatingTemplate}
                className={`text-left rounded-xl border p-4 bg-gradient-to-br ${colors.card} ${colors.border} ${colors.hoverBorder} transition-all hover:shadow-md disabled:opacity-60 disabled:cursor-wait cursor-pointer`}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${colors.iconBg} shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {isCreating ? "Criando..." : template.name}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.badge}`}>
                    Template
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
