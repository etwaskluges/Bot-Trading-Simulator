export interface BotSessionSummary {
  id: string;
  name: string;
  ownerId?: string | null;
  status: "starting" | "running" | "stopping" | "stopped";
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastTickAt?: string;
  lastTickDurationMs?: number;
  ticks: number;
  lastError?: string;
  rulesCount: number;
}
