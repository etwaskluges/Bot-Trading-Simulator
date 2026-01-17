const FALLBACK_URL = process.env.BOT_LOGIC_URL || "http://localhost:4001";

export const BOT_LOGIC_SERVER_URL = FALLBACK_URL;

export function getBotLogicPublicUrl(): string {
  if (typeof window === "undefined") {
    return FALLBACK_URL;
  }

  return (import.meta.env.VITE_BOT_LOGIC_URL as string) || FALLBACK_URL;
}
