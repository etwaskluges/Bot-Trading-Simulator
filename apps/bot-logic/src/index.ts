import "dotenv/config";
import { tick } from "./bot-engine";
import { TICK_RATE_MS, MIN_REST_DELAY_MS } from "./config";

/**
 * Main bot loop - continuously executes ticks with error handling
 */
async function startBots(): Promise<void> {
  console.log("🤖 Initializing Bot Army (Resilient Loop)...");

  while (true) {
    const startTime = Date.now();
    try {
      await tick();
    } catch (e) {
      console.error("⚠️ Tick Error:", e);
    }

    const elapsed = Date.now() - startTime;
    const delay = Math.max(MIN_REST_DELAY_MS, TICK_RATE_MS - elapsed);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// Start the engine
startBots().catch((e) => {
  console.error("Fatal Bot Error:", e);
  process.exit(1);
});
