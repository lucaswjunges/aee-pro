export interface AeeSession {
  id: string;
  userId: string;
  studentId: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  present: number;
  sessionType: string;
  objectives: string | null;
  activitiesPerformed: string | null;
  studentResponse: string | null;
  observations: string | null;
  nextSteps: string | null;
  ratingCognitive: number | null;
  ratingLinguistic: number | null;
  ratingMotor: number | null;
  ratingSocial: number | null;
  ratingAutonomy: number | null;
  ratingAcademic: number | null;
  createdAt: string;
  updatedAt: string;
}

export const SESSION_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "grupo", label: "Grupo" },
  { value: "orientacao_familia", label: "Orientação à Família" },
  { value: "orientacao_professor", label: "Orientação ao Professor" },
] as const;

export type SessionType = (typeof SESSION_TYPES)[number]["value"];

export const DIMENSION_RATINGS = [
  { key: "ratingCognitive" as const, label: "Cognitivo" },
  { key: "ratingLinguistic" as const, label: "Linguagem" },
  { key: "ratingMotor" as const, label: "Motor" },
  { key: "ratingSocial" as const, label: "Social" },
  { key: "ratingAutonomy" as const, label: "Autonomia" },
  { key: "ratingAcademic" as const, label: "Acadêmico" },
] as const;

export const RATING_SCALE = [
  { value: 1, label: "Não iniciado", color: "bg-gray-400" },
  { value: 2, label: "Em desenvolvimento inicial", color: "bg-red-400" },
  { value: 3, label: "Em progresso", color: "bg-yellow-400" },
  { value: 4, label: "Consolidando", color: "bg-blue-400" },
  { value: 5, label: "Alcançado", color: "bg-green-400" },
] as const;

export type DimensionRatingKey = (typeof DIMENSION_RATINGS)[number]["key"];
