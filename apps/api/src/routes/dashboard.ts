import { Hono } from "hono";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { students, documents, latexDocuments } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type DashEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const dashboardRoutes = new Hono<DashEnv>();

dashboardRoutes.use("*", authMiddleware);

// GET /api/dashboard/stats
dashboardRoutes.get("/stats", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  // Total students
  const studentCountResult = await db
    .select({ count: count() })
    .from(students)
    .where(eq(students.userId, userId));
  const totalStudents = studentCountResult[0]?.count ?? 0;

  // Total documents (both tables)
  const docCountResult = await db
    .select({ count: count() })
    .from(documents)
    .where(eq(documents.userId, userId));
  const latexDocCountResult = await db
    .select({ count: count() })
    .from(latexDocuments)
    .where(eq(latexDocuments.userId, userId));
  const totalDocuments =
    (docCountResult[0]?.count ?? 0) + (latexDocCountResult[0]?.count ?? 0);

  // Documents by status (both tables)
  const completedResult = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.status, "completed")));
  const latexCompletedResult = await db
    .select({ count: count() })
    .from(latexDocuments)
    .where(and(eq(latexDocuments.userId, userId), eq(latexDocuments.status, "completed")));
  const completedDocs =
    (completedResult[0]?.count ?? 0) + (latexCompletedResult[0]?.count ?? 0);

  const errorResult = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.status, "error")));
  const latexErrorResult = await db
    .select({ count: count() })
    .from(latexDocuments)
    .where(
      and(
        eq(latexDocuments.userId, userId),
        sql`${latexDocuments.status} IN ('error', 'compile_error')`
      )
    );
  const errorDocs =
    (errorResult[0]?.count ?? 0) + (latexErrorResult[0]?.count ?? 0);

  // Recent documents (last 5 from both tables, merged and sorted)
  const recentDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      studentId: documents.studentId,
      documentType: documents.documentType,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(5);

  const recentLatexDocs = await db
    .select({
      id: latexDocuments.id,
      title: latexDocuments.title,
      status: latexDocuments.status,
      studentId: latexDocuments.studentId,
      documentType: latexDocuments.documentType,
      createdAt: latexDocuments.createdAt,
    })
    .from(latexDocuments)
    .where(eq(latexDocuments.userId, userId))
    .orderBy(desc(latexDocuments.createdAt))
    .limit(5);

  const allRecentDocs = [
    ...recentDocs.map((d) => ({ ...d, source: "plain" as const })),
    ...recentLatexDocs.map((d) => ({ ...d, source: "latex" as const })),
  ]
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 5);

  // Get student names for recent docs
  const studentIds = [...new Set(allRecentDocs.map((d) => d.studentId))];
  const studentNames: Record<string, string> = {};
  for (const sId of studentIds) {
    const s = await db
      .select({ name: students.name })
      .from(students)
      .where(eq(students.id, sId))
      .get();
    if (s) studentNames[sId] = s.name;
  }

  const recentWithNames = allRecentDocs.map((d) => ({
    ...d,
    studentName: studentNames[d.studentId] ?? "Aluno removido",
  }));

  return c.json({
    success: true,
    data: {
      totalStudents,
      totalDocuments,
      completedDocs,
      errorDocs,
      recentDocuments: recentWithNames,
    },
  });
});
