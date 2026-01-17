import { createServerFn } from "@tanstack/react-start";
import type { BotSessionSummary } from "~/types/bot-sessions";
import { BOT_LOGIC_SERVER_URL } from "~/lib/config/botLogic";

async function callBotLogic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BOT_LOGIC_SERVER_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Bot logic request failed");
  }

  return response.json();
}

export const listBotSessionsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return callBotLogic<BotSessionSummary[]>("/sessions");
  }
);

export const startBotSessionFn = createServerFn({
  method: "POST",
})
  .validator(
    (
      data: {
        name?: string;
        ownerId?: string | null;
        rules: unknown[];
      } & Record<string, unknown>
    ) => data
  )
  .handler(async ({ data }) => {
    return callBotLogic<BotSessionSummary>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        ownerId: data.ownerId,
        rules: data.rules,
      }),
    });
  });

export const stopBotSessionFn = createServerFn({
  method: "DELETE",
})
  .validator(
    (
      data: {
        sessionId: string;
      } & Record<string, unknown>
    ) => data
  )
  .handler(async ({ data }) => {
    return callBotLogic<BotSessionSummary>(`/sessions/${data.sessionId}`, {
      method: "DELETE",
    });
  });
