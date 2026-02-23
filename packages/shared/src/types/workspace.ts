export interface WorkspaceProject {
  id: string;
  userId: string;
  studentId: string | null;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFile {
  id: string;
  projectId: string;
  userId: string;
  path: string;
  mimeType: string;
  sizeBytes: number | null;
  r2Key: string;
  isOutput: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceConversation {
  id: string;
  projectId: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool_result";
  content: string;
  toolCalls: string | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  result?: ToolResult;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  fileId?: string;
  filePath?: string;
}

export interface ChatStreamEvent {
  type:
    | "text"
    | "tool_call"
    | "tool_result"
    | "agent_spawn"
    | "agent_result"
    | "error"
    | "done";
  content?: string;
  toolCall?: ToolCall;
  agentId?: string;
  agentTask?: string;
  error?: string;
}

export const QUICK_ACTIONS = [
  {
    id: "gerar-documento",
    label: "Gerar Documento",
    icon: "file-text",
    description: "Crie qualquer documento AEE a partir dos dados do aluno",
    prompt:
      "Quero gerar um documento para este aluno. Quais tipos de documento você precisa?",
  },
  {
    id: "criar-jogo",
    label: "Criar Jogo Imprimível",
    icon: "gamepad-2",
    description: "Crie jogos educativos para imprimir e usar em sala",
    prompt:
      "Crie um jogo educativo imprimível adequado para este aluno, considerando seu diagnóstico e nível de desenvolvimento.",
  },
  {
    id: "material-aula",
    label: "Material de Aula",
    icon: "book-open",
    description: "Gere material didático adaptado ao aluno",
    prompt:
      "Crie um material de aula adaptado para este aluno, considerando suas necessidades e potencialidades.",
  },
  {
    id: "gerar-slides",
    label: "Gerar Apresentação",
    icon: "presentation",
    description: "Crie slides para reuniões ou apresentações",
    prompt:
      "Crie uma apresentação em LaTeX (Beamer) sobre o progresso deste aluno.",
  },
  {
    id: "editar-documento",
    label: "Editar Documento",
    icon: "pencil",
    description: "Refine ou corrija um documento existente",
    prompt:
      "Quero editar um documento existente. Liste os arquivos disponíveis no projeto.",
  },
] as const;

export type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

export interface WorkspaceFileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  r2Key: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface GoogleDriveStatus {
  connected: boolean;
  email?: string;
}
