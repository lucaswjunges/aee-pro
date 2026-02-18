import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/students";
import { settingsRoutes } from "./routes/settings";
import { documentRoutes } from "./routes/documents";
import { promptRoutes } from "./routes/prompts";
import { dashboardRoutes } from "./routes/dashboard";
import { latexDocumentRoutes } from "./routes/latex-documents";
import { imageRoutes } from "./routes/images";

export type Env = {
  Bindings: {
    DB: D1Database;
    R2: R2Bucket;
    SESSION_SECRET: string;
    LATEX_COMPILER_URL: string;
    LATEX_COMPILER_TOKEN: string;
  };
};

const app = new Hono<Env>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/auth", authRoutes);
app.route("/api/students", studentRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/prompts", promptRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/latex-documents", latexDocumentRoutes);
app.route("/api/images", imageRoutes);

export default app;
