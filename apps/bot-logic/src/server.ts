import express from "express";
import cors from "cors";
import { parseRuleSet } from "./services/strategyService";
import { sessionManager } from "./session/sessionManager";

const PORT = Number(process.env.BOT_LOGIC_PORT ?? process.env.PORT ?? 4001);
const CORS_ORIGINS = (process.env.BOT_LOGIC_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(cors({ origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true }));

app.get("/health", (_, res) => {
  res.json({ status: "ok", sessions: sessionManager.listSessions().length });
});

app.get("/sessions", (_, res) => {
  res.json(sessionManager.listSessions());
});

app.get("/sessions/:id", (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

app.post("/sessions", (req, res) => {
  try {
    const payload = req.body || {};
    const ruleInput = payload.rules ?? payload.ruleText;
    const rules = parseRuleSet(ruleInput);
    const session = sessionManager.createSession({
      name: payload.name,
      ownerId: payload.ownerId,
      rules,
    });
    res.status(201).json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse rules";
    res.status(400).json({ error: message });
  }
});

app.post("/sessions/owner", (req, res) => {
  const payload = req.body || {};
  const ownerId = payload.ownerId as string | undefined;

  if (!ownerId) {
    return res.status(400).json({ error: "ownerId is required" });
  }

  const session = sessionManager.createOrReuseSessionForOwner({
    name: payload.name,
    ownerId,
  });
  res.status(201).json(session);
});

app.delete("/sessions/:id", (req, res) => {
  const session = sessionManager.stopSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

app.delete("/sessions/owner/:ownerId", (req, res) => {
  const ownerId = req.params.ownerId;
  if (!ownerId) {
    return res.status(400).json({ error: "ownerId is required" });
  }
  const stopped = sessionManager.stopSessionsByOwner(ownerId);
  res.json({ ownerId, stopped });
});

app.use((err: unknown, _req, res, _next) => {
  console.error("Server error", err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});

export async function startServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Bot logic HTTP control plane listening on http://localhost:${PORT}`);
      resolve();
    });
    server.on("error", reject);
  });
}
