import { Hono } from "hono";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { aeeSessions, students } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type EvolutionEnv = Env & {
  Variables: {
    userId: string;
  };
};

const DIMENSION_KEYS = [
  "ratingCognitive",
  "ratingLinguistic",
  "ratingMotor",
  "ratingSocial",
  "ratingAutonomy",
  "ratingAcademic",
] as const;

const DIMENSION_LABELS: Record<string, string> = {
  ratingCognitive: "Cognitivo",
  ratingLinguistic: "Linguagem",
  ratingMotor: "Motor",
  ratingSocial: "Social",
  ratingAutonomy: "Autonomia",
  ratingAcademic: "Acadêmico",
};

export const evolutionRoutes = new Hono<EvolutionEnv>();

evolutionRoutes.use("*", authMiddleware);

// GET /evolution/:studentId
evolutionRoutes.get("/:studentId", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.param("studentId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const db = createDb(c.env.DB);

  // Verify student ownership
  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  // Build conditions
  const conditions = [
    eq(aeeSessions.userId, userId),
    eq(aeeSessions.studentId, studentId),
  ];
  if (from) conditions.push(gte(aeeSessions.sessionDate, from));
  if (to) conditions.push(lte(aeeSessions.sessionDate, to));

  const sessions = await db
    .select()
    .from(aeeSessions)
    .where(and(...conditions))
    .orderBy(aeeSessions.sessionDate);

  // Filter to only sessions with at least one rating
  const rated = sessions.filter((s) =>
    DIMENSION_KEYS.some((k) => s[k] != null),
  );

  // Build dimension series
  const dimensions: Record<string, { date: string; rating: number }[]> = {};
  for (const key of DIMENSION_KEYS) {
    dimensions[key] = [];
  }

  for (const s of rated) {
    for (const key of DIMENSION_KEYS) {
      const val = s[key];
      if (val != null) {
        dimensions[key].push({ date: s.sessionDate, rating: val });
      }
    }
  }

  // Summary: average per dimension
  const summary: Record<string, { label: string; average: number | null; count: number; trend: string }> = {};
  for (const key of DIMENSION_KEYS) {
    const series = dimensions[key];
    if (series.length === 0) {
      summary[key] = { label: DIMENSION_LABELS[key], average: null, count: 0, trend: "sem dados" };
    } else {
      const avg = series.reduce((sum, p) => sum + p.rating, 0) / series.length;
      let trend = "estável";
      if (series.length >= 2) {
        const first = series[0].rating;
        const last = series[series.length - 1].rating;
        if (last > first) trend = "melhora";
        else if (last < first) trend = "retrocesso";
      }
      summary[key] = { label: DIMENSION_LABELS[key], average: Math.round(avg * 10) / 10, count: series.length, trend };
    }
  }

  return c.json({
    success: true,
    data: {
      totalSessions: sessions.length,
      ratedSessions: rated.length,
      dimensions,
      summary,
    },
  });
});
