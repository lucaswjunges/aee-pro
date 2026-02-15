export interface Document {
  id: string;
  userId: string;
  studentId: string;
  promptId: string | null;
  documentType: string;
  title: string;
  content: string | null;
  status: "generating" | "completed" | "error";
  aiProvider: string | null;
  aiModel: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LatexDocumentStatus =
  | "generating"
  | "compiling"
  | "completed"
  | "compile_error"
  | "error";

export interface LatexDocument {
  id: string;
  userId: string;
  studentId: string;
  documentType: string;
  title: string;
  latexSource: string | null;
  pdfR2Key: string | null;
  pdfSizeBytes: number | null;
  status: LatexDocumentStatus;
  heatLevel: number;
  sizeLevel: number;
  aiProvider: string | null;
  aiModel: string | null;
  compilationAttempts: number;
  lastCompilationError: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const LATEX_DOCUMENT_TYPES = [
  { slug: "anamnese", name: "Anamnese" },
  { slug: "estudo-de-caso", name: "Estudo de Caso" },
  { slug: "pdi", name: "PDI - Plano de Desenvolvimento Individual" },
  { slug: "plano-intervencao", name: "Plano de Intervenção" },
  { slug: "adaptacoes-curriculares", name: "Adaptações Curriculares" },
  { slug: "adaptacao-avaliacoes", name: "Adaptação de Avaliações" },
  { slug: "diario-bordo", name: "Diário de Bordo" },
  { slug: "avancos-retrocessos", name: "Avanços e Retrocessos" },
  { slug: "relatorio-familia", name: "Relatório para Família" },
  { slug: "relatorio-professor", name: "Relatório para Professor" },
  { slug: "ata-reuniao", name: "Ata de Reunião" },
  { slug: "rotina-visual", name: "Rotina Visual" },
  { slug: "agrupamento-alunos", name: "Agrupamento de Alunos" },
  { slug: "parecer-descritivo", name: "Parecer Descritivo" },
  { slug: "sugestao-atendimento", name: "Sugestão de Atendimento" },
] as const;

export const HEAT_LEVELS = [
  { level: 1, name: "Conservador", description: "Texto corrido com seções. Limpo e minimalista." },
  { level: 2, name: "Simples", description: "Datacard e infobox para dados. Tabelas simples." },
  { level: 3, name: "Moderado", description: "Tcolorbox, tabelas coloridas, 1-2 diagramas TikZ." },
  { level: 4, name: "Elaborado", description: "Gráficos pgfplots, diagramas TikZ, capa visual." },
  { level: 5, name: "Máximo", description: "Tudo: pgfplots, mind maps, diagramas, capa completa, watermark." },
] as const;

export const SIZE_LEVELS = [
  { level: 1, name: "Resumido", pages: "2-4", maxTokens: 6000 },
  { level: 2, name: "Compacto", pages: "4-6", maxTokens: 10000 },
  { level: 3, name: "Padrão", pages: "6-10", maxTokens: 16000 },
  { level: 4, name: "Detalhado", pages: "10-14", maxTokens: 24000 },
  { level: 5, name: "Completo", pages: "14-18", maxTokens: 32000 },
] as const;

export interface Prompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  requiredFields: string | null;
  isBuiltIn: boolean;
  sortOrder: number;
  promptTemplate?: string | null;
  userId?: string | null;
}
