import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { students } from "@aee-pro/db/schema";
import { studentSchema, studentUpdateSchema } from "@aee-pro/shared";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type StudentEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const studentRoutes = new Hono<StudentEnv>();

studentRoutes.use("*", authMiddleware);

// All nullable text fields in the student schema
const nullableFields = [
  "dateOfBirth", "grade", "school", "shift", "sexo", "turma", "matricula",
  "profRegular", "coordenadora", "diagnosis", "diagnosticoCid", "classificacao",
  "medicamentos", "alergias", "terapiasAtuais", "historicoMedico",
  "responsibleName", "responsiblePhone", "responsibleEmail",
  "maeNome", "maeIdade", "maeProfissao", "maeEscolaridade",
  "paiNome", "paiIdade", "paiProfissao", "paiEscolaridade",
  "composicaoFamiliar", "endereco", "rotinaFamiliar", "comunicacaoCasa",
  "desenvMotor", "desenvLinguagem", "desenvCognitivo", "desenvSocial",
  "desenvAutonomia", "comportamentoEmocional", "habLeitura", "habEscrita",
  "habMatematica", "teacherName", "tipoAtendimento", "frequencia",
  "dificuldadesIniciais", "potencialidades", "barreiras",
  "necessidadesAcessibilidade", "expectativasFamilia", "observations",
] as const;

function normalizeNullables(data: Record<string, unknown>) {
  const result = { ...data };
  for (const field of nullableFields) {
    if (field in result) {
      result[field] = result[field] || null;
    }
  }
  return result;
}

studentRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const result = await db
    .select()
    .from(students)
    .where(eq(students.userId, userId));

  return c.json({ success: true, data: result });
});

studentRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  return c.json({ success: true, data: student });
});

studentRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const data = {
    id,
    userId,
    name: parsed.data.name,
    ...normalizeNullables(parsed.data),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(students).values(data as typeof students.$inferInsert);

  return c.json({ success: true, data }, 201);
});

studentRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();

  const parsed = studentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  const now = new Date().toISOString();
  await db
    .update(students)
    .set({ ...normalizeNullables(parsed.data), updatedAt: now } as Partial<typeof students.$inferInsert>)
    .where(and(eq(students.id, id), eq(students.userId, userId)));

  const updated = await db
    .select()
    .from(students)
    .where(eq(students.id, id))
    .get();

  return c.json({ success: true, data: updated });
});

studentRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  await db
    .delete(students)
    .where(and(eq(students.id, id), eq(students.userId, userId)));

  return c.json({ success: true });
});
