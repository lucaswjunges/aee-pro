import express from "express";
import { runAgent } from "./agent-runner.js";

const app = express();
const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AGENT_AUTH_TOKEN || "";

app.use(express.json({ limit: "100mb" }));

// Auth middleware
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next(); // No auth configured = dev mode
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "aee-pro-agent" });
});

// Main agent endpoint — returns SSE stream
app.post("/agent/run", requireAuth, async (req, res) => {
  const {
    files,
    systemPrompt,
    messages,
    studentData,
    promptTemplates,
    proMaxEnhancements,
    projectId,
    model,
    maxTurns = 35,
    maxThinkingTokens = 16000,
  } = req.body;

  if (!systemPrompt) {
    return res.status(400).json({ error: "systemPrompt is required" });
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Keepalive: send a comment every 15s to prevent proxy timeouts
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15_000);

  function sendSSE(data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected
    }
  }

  try {
    await runAgent({
      files: files || [],
      systemPrompt,
      messages: messages || [],
      studentData: studentData || null,
      promptTemplates: promptTemplates || {},
      proMaxEnhancements: proMaxEnhancements || {},
      projectId: projectId || "unknown",
      model: model || undefined,
      maxTurns,
      maxThinkingTokens,
      sendSSE,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agent/run] Fatal error:", msg);
    sendSSE({ type: "error", content: msg });
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});

// CORS preflight
app.options("/agent/run", (_req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`[agent-service] listening on port ${PORT}`);
  console.log(`[agent-service] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);
});
