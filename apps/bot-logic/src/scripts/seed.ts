import "dotenv/config";
import { randomUUID } from "crypto";
import postgres from "postgres";

const STOCK_SYMBOL = process.env.BOT_LOGIC_SEED_STOCK_SYMBOL ?? "VIBE";
const STOCK_NAME = process.env.BOT_LOGIC_SEED_STOCK_NAME ?? "Vibe Test Asset";
const STOCK_PRICE =
  Number(process.env.BOT_LOGIC_SEED_STOCK_PRICE_CENTS) || 100_000; // $1,000 default
const STRATEGY_NAME = process.env.BOT_LOGIC_SEED_STRATEGY_NAME ?? "Browser Seed Strategy";
const TRADER_NAME = process.env.BOT_LOGIC_SEED_TRADER_NAME ?? "Demo Bot";
const TRADER_BALANCE = Number(process.env.BOT_LOGIC_SEED_TRADER_BALANCE_CENTS) || 5_000_000;
const TEST_USER_ID = "a9f6ad0a-feaf-4f6f-849b-49fbb9f68d62";

const connectionString =
  process.env.SUPABASE_DB_URL || "postgres://postgres:postgres@localhost:5432/postgres";

const sql = postgres(connectionString, {
  max: 2,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

async function ensureStock() {
  const existing = await sql`
    SELECT id FROM stocks WHERE symbol = ${STOCK_SYMBOL} LIMIT 1
  `;
  if (existing.length) {
    return existing[0].id;
  }

  const inserted = await sql`
    INSERT INTO stocks (symbol, name, current_price_cents, total_shares)
    VALUES (${STOCK_SYMBOL}, ${STOCK_NAME}, ${STOCK_PRICE}, 100000)
    RETURNING id
  `;
  return inserted[0].id;
}

async function ensureStrategy() {
  const existing = await sql`
    SELECT strategy_id AS id FROM strategies WHERE strategy_name = ${STRATEGY_NAME} LIMIT 1
  `;
  if (existing.length) {
    return existing[0].id;
  }

  const strategyId = randomUUID();
  await sql`
    INSERT INTO strategies (strategy_id, user_id, strategy_name, strategy_json)
    VALUES (${strategyId}, ${TEST_USER_ID}, ${STRATEGY_NAME}, ${JSON.stringify([])})
  `;
  return strategyId;
}

async function ensureTrader(strategyId: string) {
  const existing = await sql`
    SELECT id FROM traders WHERE name = ${TRADER_NAME} LIMIT 1
  `;
  if (existing.length) {
    return existing[0].id;
  }

  const inserted = await sql`
    INSERT INTO traders (name, is_bot, balance_cents, strategy_id)
    VALUES (${TRADER_NAME}, true, ${TRADER_BALANCE}, ${strategyId})
    RETURNING id
  `;
  return inserted[0].id;
}

async function seed() {
  console.log("🚜 Running bot-logic seeding script...");
  const stockId = await ensureStock();
  const strategyId = await ensureStrategy();
  const traderId = await ensureTrader(strategyId);
  console.log("");
  console.log("✅ Seed results:");
  console.log(`  • stock ${STOCK_SYMBOL} -> ${stockId}`);
  console.log(`  • strategy ${STRATEGY_NAME} -> ${strategyId}`);
  console.log(`  • trader ${TRADER_NAME} -> ${traderId}`);
  console.log("🎯 Ready to run the bot with the seeded data.");
}

seed().catch((error) => {
  console.error("🔥 Seed failed:", error);
  process.exit(1);
});

process.on("exit", () => {
  void sql.end({ timeout: 0 });
});
