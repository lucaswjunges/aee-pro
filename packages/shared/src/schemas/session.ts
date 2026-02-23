import { z } from "zod";

export const aeeSessionSchema = z.object({
  studentId: z.string().min(1, "Aluno é obrigatório"),
  sessionDate: z.string().min(1, "Data da sessão é obrigatória"),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  present: z.number().int().min(0).max(1).default(1),
  sessionType: z
    .enum(["individual", "grupo", "orientacao_familia", "orientacao_professor"])
    .default("individual"),
  objectives: z.string().nullable().optional(),
  activitiesPerformed: z.string().nullable().optional(),
  studentResponse: z.string().nullable().optional(),
  observations: z.string().nullable().optional(),
  nextSteps: z.string().nullable().optional(),
  ratingCognitive: z.number().int().min(1).max(5).nullable().optional(),
  ratingLinguistic: z.number().int().min(1).max(5).nullable().optional(),
  ratingMotor: z.number().int().min(1).max(5).nullable().optional(),
  ratingSocial: z.number().int().min(1).max(5).nullable().optional(),
  ratingAutonomy: z.number().int().min(1).max(5).nullable().optional(),
  ratingAcademic: z.number().int().min(1).max(5).nullable().optional(),
});

export const aeeSessionUpdateSchema = aeeSessionSchema.partial();

export type AeeSessionInput = z.infer<typeof aeeSessionSchema>;
export type AeeSessionUpdateInput = z.infer<typeof aeeSessionUpdateSchema>;
