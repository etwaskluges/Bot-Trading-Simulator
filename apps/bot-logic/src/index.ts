import "dotenv/config";
import { postgres_db, schema, eq, and } from "@vibe-coding-boilerplate/db-drizzle";

const TICK_RATE_MS = 2000;

// Track last price per stock
const lastPrices = new Map<string, number>();

async function startBots() {
  console.log("🤖 Initializing Bot Army (Direct DB Connection)...");

  // 1. Fetch Configuration from DB
  let bots, stocks;
  try {
    bots = await postgres_db.select().from(schema.traders).where(eq(schema.traders.is_bot, true));
    stocks = await postgres_db.select().from(schema.stocks);
  } catch (e) {
    console.error("❌ CRITICAL: Could not connect to Database from Bot Logic.");
    console.error("   Check your .env file in apps/bot-logic.");
    console.error(e);
    process.exit(1);
  }

  if (bots.length === 0 || stocks.length === 0) {
    console.error("❌ No bots or stocks found! Did you run the seed script?");
    process.exit(1);
  }

  console.log(`✅ Loaded ${bots.length} Bots for ${stocks.length} stocks`);

  // 2. THE LOOP
  setInterval(async () => {
    try {
      // A. Fetch Market Data directly from DB
      const marketData = await postgres_db.select().from(schema.stocks);

      // B. For each stock, execute bot strategies
      for (const stock of stocks) {
        const currentStock = marketData.find((s: any) => s.id === stock.id);

        if (!currentStock) {
          console.error(`❌ Stock ${stock.symbol} not found in DB response`);
          continue;
        }

        const currentPrice = Number(currentStock.current_price_cents);

        console.log(`\n📊 ${stock.symbol} Market Price: ${currentPrice} cents`);

        // Execute Strategy for EACH Bot
        for (const bot of bots) {
          await manageOrders(bot, stock, currentPrice);
          await makeDecision(bot, stock, currentPrice);
        }

        // Update last price for this stock
        lastPrices.set(stock.id, currentPrice);
      }

    } catch (e) {
      console.error("⚠️ Bot Loop Fatal Error:", e);
    }
  }, TICK_RATE_MS);
}

async function manageOrders(bot: any, stock: any, currentPrice: number) {
  try {
    // Fetch my open orders directly from DB
    const myOrders = await postgres_db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.trader_id, bot.id),
          eq(schema.orders.status, "OPEN")
        )
      );

    for (const order of myOrders) {
      if (order.stock_id !== stock.id) continue;

      const limitPrice = Number(order.limit_price_cents);
      const priceDiffPercent = Math.abs(limitPrice - currentPrice) / (currentPrice || 1);

      // cancellation strategy: 
      // If the price has moved more than 5% away from our limit price, it's unlikely to fill soon.
      let shouldCancel = priceDiffPercent > 0.05;

      const strategy = (bot.strategy || "Random").toLowerCase();
      if (strategy === "momentum") {
        const lastPrice = lastPrices.get(stock.id) || currentPrice;
        // If we have a BUY order but price is falling, cancel it
        if (order.type === 'BUY' && currentPrice < lastPrice) {
          shouldCancel = true;
        }
        // If we have a SELL order but price is rising, cancel it
        if (order.type === 'SELL' && currentPrice > lastPrice) {
          shouldCancel = true;
        }
      }

      if (shouldCancel) {
        console.log(`   ✂️  ${bot.name} cancelling ${order.type} order @ ${limitPrice} (Price: ${currentPrice})`);

        await postgres_db
          .update(schema.orders)
          .set({ status: 'CANCELLED' } as any)
          .where(
            and(
              eq(schema.orders.id, order.id),
              eq(schema.orders.trader_id, bot.id),
              eq(schema.orders.status, 'OPEN')
            )
          );
      }
    }
  } catch (e) {
    console.error(`   ❌ Error managing orders for ${bot.name}:`, e);
  }
}

async function makeDecision(bot: any, stock: any, currentPrice: number) {
  const lastPrice = lastPrices.get(stock.id) || currentPrice;
  const strategy = (bot.strategy || "Random").toLowerCase();

  let action: 'BUY' | 'SELL';

  if (strategy === "momentum") {
    // Momentum Strategy: Follow the trend
    if (currentPrice > lastPrice) {
      action = 'BUY'; // Price is going up, buy more
    } else if (currentPrice < lastPrice) {
      action = 'SELL'; // Price is going down, sell
    } else {
      action = Math.random() > 0.5 ? 'BUY' : 'SELL';
    }
  } else if (strategy === "swing") {
    // Swing Strategy: Counter-trend (Mean Reversion)
    if (currentPrice > lastPrice) {
      action = 'SELL'; // Price went up, take profit
    } else if (currentPrice < lastPrice) {
      action = 'BUY'; // Price went down, buy the dip
    } else {
      action = Math.random() > 0.5 ? 'BUY' : 'SELL';
    }
  } else {
    // Random Strategy (default)
    action = Math.random() > 0.5 ? 'BUY' : 'SELL';
  }

  // Randomize Quantity (1 to 10)
  const quantity = Math.floor(Math.random() * 10) + 1;

  // Price Buffer (2%)
  const priceBuffer = Math.floor(currentPrice * 0.02);
  const limitPrice = action === 'BUY'
    ? currentPrice + priceBuffer
    : Math.max(1, currentPrice - priceBuffer);

  // Send Order directly to DB
  try {
    await postgres_db.insert(schema.orders).values({
      stock_id: stock.id as any,
      trader_id: bot.id as any,
      type: action,
      limit_price_cents: limitPrice,
      quantity: quantity,
    } as any);

    console.log(`   🤖 ${bot.name} (${bot.strategy}) [${action}] ${quantity} units of ${stock.symbol} @ ${limitPrice}`);
  } catch (error: any) {
    // Only log errors if they are not "Insufficient balance" which is common for bots
    const msg = error.message || String(error);
    if (!msg.toLowerCase().includes("check constraint") && !msg.toLowerCase().includes("balance")) {
      console.log(`   ❌ ${bot.name} on ${stock.symbol} Failed: ${msg}`);
    }
  }
}

// Start
startBots();