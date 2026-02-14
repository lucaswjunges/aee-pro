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
