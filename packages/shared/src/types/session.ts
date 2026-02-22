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
