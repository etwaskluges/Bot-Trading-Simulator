import { BotSession, BotSessionConfig, BotSessionSummary } from "./botSession";

class SessionManager {
  private readonly sessions = new Map<string, BotSession>();

  createSession(config: BotSessionConfig): BotSessionSummary {
    const session = new BotSession(config);
    this.sessions.set(session.id, session);
    session.start();
    return session.summary;
  }

  getSessionByOwner(ownerId: string): BotSessionSummary | null {
    for (const session of this.sessions.values()) {
      if (session.ownerId === ownerId && session.status !== "stopped") {
        return session.summary;
      }
    }
    return null;
  }

  createOrReuseSessionForOwner(config: BotSessionConfig & { ownerId: string }): BotSessionSummary {
    const existing = this.getSessionByOwner(config.ownerId);
    if (existing) return existing;
    return this.createSession(config);
  }

  listSessions(): BotSessionSummary[] {
    return Array.from(this.sessions.values()).map((session) => session.summary);
  }

  getSession(id: string): BotSessionSummary | null {
    const session = this.sessions.get(id);
    return session ? session.summary : null;
  }

  stopSession(id: string): BotSessionSummary | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    session.stop();
    return session.summary;
  }

  stopSessionsByOwner(ownerId: string): BotSessionSummary[] {
    const stopped: BotSessionSummary[] = [];
    for (const session of this.sessions.values()) {
      if (session.ownerId !== ownerId) continue;
      if (session.status === "stopped") continue;
      session.stop();
      stopped.push(session.summary);
    }
    return stopped;
  }
}

export const sessionManager = new SessionManager();
