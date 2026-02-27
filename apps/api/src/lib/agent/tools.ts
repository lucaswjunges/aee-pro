/**
 * Tool definitions for the workspace AI agent.
 * Descriptions are kept concise to minimize token usage.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Lê conteúdo de um arquivo. Use ANTES de edit_file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo inteiro. Para edições parciais, use edit_file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo" },
        content: { type: "string", description: "Conteúdo completo" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Substituição parcial: encontra old_text exato e troca por new_text. Use read_file antes para verificar o conteúdo real. replace_all=true substitui TODAS as ocorrências.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo" },
        old_text: { type: "string", description: "Texto exato a substituir" },
        new_text: { type: "string", description: "Novo texto" },
        replace_all: { type: "boolean", description: "Substituir todas as ocorrências (padrão: false)" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "list_files",
    description: "Lista todos os arquivos do projeto.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_file",
    description: "Remove um arquivo do projeto.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo" },
      },
      required: ["path"],
    },
  },
  {
    name: "rename_file",
    description: "Renomeia/move um arquivo.",
    input_schema: {
      type: "object",
      properties: {
        old_path: { type: "string", description: "Caminho atual" },
        new_path: { type: "string", description: "Novo caminho" },
      },
      required: ["old_path", "new_path"],
    },
  },
  {
    name: "search_files",
    description: "Busca texto/regex em todos os arquivos do projeto.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto ou regex" },
      },
      required: ["query"],
    },
  },
  {
    name: "compile_latex",
    description:
      "Compila .tex em PDF. Se erro: read_file → edit_file → recompilar. Max 5 tentativas.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Arquivo .tex" },
      },
      required: ["path"],
    },
  },
  {
    name: "get_student_data",
    description:
      "Retorna dados completos do aluno. Se o projeto tem aluno vinculado, retorna automaticamente. Se não, use o parâmetro 'name' para buscar por nome (busca parcial). Sem parâmetros e sem vínculo: lista todos os alunos disponíveis.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome (parcial) do aluno para buscar. Opcional — se omitido, usa o aluno vinculado ao projeto." },
      },
    },
  },
  {
    name: "get_prompt_template",
    description:
      "Template de documento AEE. Slugs: anamnese, pei, pdi, estudo-de-caso, parecer-descritivo, plano-intervencao, adaptacoes-curriculares, adaptacao-avaliacoes, diario-bordo, avancos-retrocessos, relatorio-familia, relatorio-professor, ata-reuniao, rotina-visual",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Slug do documento" },
      },
      required: ["slug"],
    },
  },
  {
    name: "assess_quality",
    description:
      "Avalia qualidade de um documento .tex: score 0-100, elementos visuais, estrutura, desertos de texto, fixes prioritários. Use APÓS compilar com sucesso.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Arquivo .tex para avaliar" },
      },
      required: ["path"],
    },
  },
  {
    name: "spawn_agent",
    description: "Dispara sub-agente para tarefa paralela. Tem acesso aos mesmos tools (exceto spawn_agent).",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Tarefa para o sub-agente" },
        context: { type: "string", description: "Contexto adicional" },
      },
      required: ["task"],
    },
  },
];

/** Subset of tools for sub-agents (no spawn_agent to prevent infinite recursion) */
export const SUBAGENT_TOOLS = WORKSPACE_TOOLS.filter(
  (t) => t.name !== "spawn_agent"
);
