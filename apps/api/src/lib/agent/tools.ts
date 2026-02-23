/**
 * Tool definitions for the workspace AI agent.
 * These are sent to Claude as available tools in the API call.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Lê o conteúdo de um arquivo do projeto. Retorna o texto do arquivo. Use para verificar o que já existe antes de editar.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo no projeto (ex: 'main.tex', 'images/foto.jpg')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Cria ou sobrescreve um arquivo no projeto. Use para criar novos documentos LaTeX, texto, ou qualquer arquivo de texto.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo (ex: 'main.tex', 'capitulo1.tex')",
        },
        content: {
          type: "string",
          description: "Conteúdo completo do arquivo",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Faz uma edição parcial em um arquivo existente: encontra uma string e a substitui por outra. Mais eficiente que reescrever o arquivo inteiro.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo a editar",
        },
        old_text: {
          type: "string",
          description: "Texto exato a ser encontrado e substituído",
        },
        new_text: {
          type: "string",
          description: "Texto que substituirá o old_text",
        },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "list_files",
    description:
      "Lista todos os arquivos do projeto com seus caminhos, tipos e tamanhos.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "delete_file",
    description: "Remove um arquivo do projeto.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo a remover",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description:
      "Busca uma string ou regex no conteúdo de todos os arquivos de texto do projeto. Retorna os trechos encontrados com nome do arquivo e linha.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Texto ou regex para buscar",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "compile_latex",
    description:
      "Compila um arquivo .tex do projeto em PDF usando pdflatex. Retorna sucesso/erro e warnings de compilação. Se der erro, leia o log e corrija.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho do arquivo .tex a compilar (ex: 'main.tex')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "get_student_data",
    description:
      "Busca os dados completos de um aluno (nome, diagnóstico, família, desenvolvimento, etc). Necessário para gerar documentos personalizados.",
    input_schema: {
      type: "object",
      properties: {
        student_id: {
          type: "string",
          description: "ID do aluno (use o studentId do projeto se disponível)",
        },
      },
      required: ["student_id"],
    },
  },
  {
    name: "get_prompt_template",
    description:
      "Busca o template de prompt para um tipo de documento AEE (anamnese, pei, pdi, estudo-de-caso, etc). Retorna o texto do prompt com placeholders.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug do tipo de documento (ex: 'anamnese', 'pei', 'pdi', 'estudo-de-caso')",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "spawn_agent",
    description:
      "Dispara um sub-agente para realizar uma tarefa específica em paralelo. O sub-agente tem acesso aos mesmos tools. Use para dividir tarefas complexas: por exemplo, gerar múltiplos documentos simultaneamente, ou corrigir erros enquanto gera outro arquivo.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Descrição clara da tarefa para o sub-agente executar",
        },
        context: {
          type: "string",
          description: "Contexto adicional necessário (ex: dados do aluno, conteúdo de referência)",
        },
      },
      required: ["task"],
    },
  },
];

/** Subset of tools for sub-agents (no spawn_agent to prevent infinite recursion) */
export const SUBAGENT_TOOLS = WORKSPACE_TOOLS.filter(
  (t) => t.name !== "spawn_agent"
);
