import { randomUUID } from "crypto";
import type { RuleProperties } from "json-rules-engine";
import { MIN_REST_DELAY_MS, TICK_RATE_MS } from "../config";
import { BotTickContext, tick } from "../bot-engine";
import { PriceTracker } from "../services/priceTracker";
import { StrategyEvaluator } from "../services/strategyService";

export type BotSessionStatus = "starting" | "running" | "stopping" | "stopped";

export interface BotSessionConfig {
  name?: string;
  ownerId?: string | null;
  rules?: RuleProperties[];
}

export interface BotSessionSummary {
  id: string;
  name: string;
  ownerId?: string | null;
  status: BotSessionStatus;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastTickAt?: string;
  lastTickDurationMs?: number;
  ticks: number;
  lastError?: string;
  rulesCount: number;
}

export class BotSession {
  public readonly id = randomUUID();
  public readonly createdAt = new Date();
  public status: BotSessionStatus = "starting";
  public startedAt: Date | null = null;
  public stoppedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  public lastTickDurationMs: number | null = null;
  public lastError: string | null = null;
  public ticks = 0;

  private readonly abortController = new AbortController();
  private readonly priceTracker = new PriceTracker();
  private readonly strategyEvaluator: StrategyEvaluator | null;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly config: BotSessionConfig) {
    const rules = config.rules && config.rules.length > 0 ? config.rules : null;
    this.strategyEvaluator = rules ? new StrategyEvaluator(rules) : null;
  }

  get name(): string {
    return this.config.name || "Unnamed session";
  }

  get ownerId(): string | null | undefined {
    return this.config.ownerId;
  }

  get summary(): BotSessionSummary {
    return {
      id: this.id,
      name: this.name,
      ownerId: this.ownerId,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      stoppedAt: this.stoppedAt?.toISOString(),
      lastTickAt: this.lastTickAt?.toISOString(),
      lastTickDurationMs: this.lastTickDurationMs ?? undefined,
      ticks: this.ticks,
      lastError: this.lastError ?? undefined,
      rulesCount: this.strategyEvaluator?.rules.length ?? 0,
    };
  }

  start(): Promise<void> {
    if (this.loopPromise) return this.loopPromise;
    this.startedAt = new Date();
    this.status = "running";
    this.loopPromise = this.runLoop();
    return this.loopPromise;
  }

  stop(): void {
    if (this.abortController.signal.aborted) return;
    this.status = "stopping";
    this.abortController.abort();
  }

  private async runLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      const loopStart = Date.now();
      try {
        await tick(this.buildContext());
        this.lastError = null;
      } catch (error) {
        this.lastError =
          error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
        console.error(`[BotSession:${this.id}] Tick error`, error);
      } finally {
        this.ticks += 1;
        this.lastTickAt = new Date();
        this.lastTickDurationMs = Date.now() - loopStart;
      }

      if (this.abortController.signal.aborted) break;

      const delay = Math.max(MIN_REST_DELAY_MS, TICK_RATE_MS - (this.lastTickDurationMs ?? 0));
      await this.sleep(delay);
    }

    this.status = "stopped";
    this.stoppedAt = new Date();
  }

  private buildContext(): BotTickContext {
    return {
      sessionId: this.id,
      strategyEvaluator: this.strategyEvaluator ?? undefined,
      priceTracker: this.priceTracker,
      ownerId: this.ownerId ?? undefined,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      this.abortController.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
  }
}
