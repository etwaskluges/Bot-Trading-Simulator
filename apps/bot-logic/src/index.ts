import "dotenv/config";
import { postgres_db, schema, eq, and, inArray } from "@vibe-coding-boilerplate/db-drizzle";
import { sql } from "drizzle-orm";

const TICK_RATE_MS = 2000;

// Track last price per stock to calculate momentum
const lastPrices = new Map<string, number>();

async function startBots() {
  console.log("🤖 Initializing Bot Army (Resilient Loop)...");

  while (true) {
    const startTime = Date.now();
    try {
      await tick();
    } catch (e) {
      console.error("⚠️ Tick Error:", e);
    }

    const elapsed = Date.now() - startTime;
    const delay = Math.max(500, TICK_RATE_MS - elapsed); // Ensure at least 500ms rest
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function tick() {
  // 1. Bulk Fetch Data (Minimize DB Round Trips)
  const [bots, stocks] = await Promise.all([
    postgres_db.select().from(schema.traders).where(eq(schema.traders.is_bot, true)),
    postgres_db.select().from(schema.stocks),
  ]);

  if (!bots.length || !stocks.length) {
    console.log("🔸 Waiting for bots/stocks to be seeded...");
    return;
  }

  const botIds = bots.map(b => b.id);

  // Fetch Open Orders for ALL bots in one go
  const allOpenOrders = await postgres_db
    .select()
    .from(schema.orders)
    .where(
      and(
        inArray(schema.orders.trader_id, botIds),
        eq(schema.orders.status, "OPEN")
      )
    );

  // Fetch Portfolios for ALL bots in one go (to check share ownership)
  const allPortfolios = await postgres_db
    .select()
    .from(schema.portfolios)
    .where(inArray(schema.portfolios.trader_id, botIds));

  // Organize Data for O(1) Access
  const ordersByBot = new Map<string, typeof allOpenOrders>();
  for (const order of allOpenOrders) {
    const list = ordersByBot.get(order.trader_id) || [];
    list.push(order);
    ordersByBot.set(order.trader_id, list);
  }

  const portfolioByBotAndStock = new Map<string, number>();
  for (const p of allPortfolios) {
    portfolioByBotAndStock.set(`${p.trader_id}-${p.stock_id}`, p.shares_owned);
  }

  const ordersToInsert: any[] = [];
  const ordersToCancelIds: string[] = [];

  // Track ephemeral balance to prevent overdrafts within the same tick
  const botAvailableBalance = new Map<string, number>();
  for (const bot of bots) {
    botAvailableBalance.set(bot.id, Number(bot.balance_cents));
  }

  // 2. Process Logic per Stock
  for (const stock of stocks) {
    const currentPrice = Number(stock.current_price_cents);
    const previousPrice = lastPrices.get(stock.id);

    // Update history for next tick
    lastPrices.set(stock.id, currentPrice);

    if (previousPrice === undefined) {
      // First tick seen for this stock, cannot determine trend yet.
      continue;
    }

    // Determine Trend
    const isPriceUp = currentPrice > previousPrice;
    const isPriceDown = currentPrice < previousPrice;

    console.log(`📊 ${stock.symbol}: ${currentPrice} (Prev: ${previousPrice}) ${isPriceUp ? '↗️' : isPriceDown ? '↘️' : '➡️'}`);

    for (const bot of bots) {
      const botOrders = ordersByBot.get(bot.id) || [];
      const stockOrders = botOrders.filter(o => o.stock_id === stock.id);

      const strategy = (bot.strategy || "Random").toLowerCase();
      const sharesOwned = portfolioByBotAndStock.get(`${bot.id}-${stock.id}`) || 0;
      const balance = Number(bot.balance_cents);

      // --- CANCEL LOGIC ---
      // If we have too many orders, or orders that are bad, cancel them.
      // Logic: Only allow 1 open order per stock per bot to prevent flooding
      if (stockOrders.length > 0) {
        // Check if existing order is stale or against strategy
        for (const order of stockOrders) {
          const limitPrice = Number(order.limit_price_cents);
          const diffPercent = Math.abs(limitPrice - currentPrice) / currentPrice;

          let shouldCancel = false;

          // 1. Too far from price (5%)
          // strictly apply to random bots
          if (strategy === 'random' && diffPercent > 0.05) shouldCancel = true;

          // 2. Momentum Invalidated
          if (strategy === "momentum") {
            if (order.type === 'BUY' && isPriceDown) shouldCancel = true;
            if (order.type === 'SELL' && isPriceUp) shouldCancel = true;
          }

          // 3. Random Bot Churn (Fix for "Stuck" bots)
          // Random bots should be impatient. If their order hasn't filled, cancel and retry.
          // This prevents them from sitting passively forever.
          if (strategy === "random") {
            shouldCancel = true;
          }

          // 3. To allow placing a new better order (if we limit to 1 order)
          // For now, let's say if we have an order, we don't place a new one, unless we cancel this one.
          // Let's implement active management: if not cancelled, we skip creation.

          if (shouldCancel) {
            ordersToCancelIds.push(order.id);
            // If we are cancelling a BUY, we effectively get that money back for this tick's budget
            if (order.type === 'BUY') {
              const currentBal = botAvailableBalance.get(bot.id) || 0;
              const refund = Number(order.limit_price_cents) * order.quantity;
              botAvailableBalance.set(bot.id, currentBal + refund);
            }
          }
        }

        // If we still have an uncanceled order for this stock, skip placing a new one
        // This prevents the bot from stacking orders.
        const keepingOrder = stockOrders.find(o => !ordersToCancelIds.includes(o.id));
        if (keepingOrder) continue;
      }

      // --- CREATE LOGIC ---
      let action: 'BUY' | 'SELL' | null = null;

      if (strategy === "momentum") {
        if (isPriceUp) action = 'BUY';
        else if (isPriceDown) action = 'SELL';
      } else if (strategy === "swing") {
        if (isPriceUp) action = 'SELL';
        else if (isPriceDown) action = 'BUY';
      } else {
        // Random
        action = Math.random() > 0.5 ? 'BUY' : 'SELL';
      }

      if (!action) continue;

      // Randomize Quantity (1 to 5 to be safer)
      const quantity = Math.floor(Math.random() * 5) + 1;

      // Price Logic
      // Aggressive bots: match market. Passive: limit.
      const priceBuffer = Math.floor(currentPrice * 0.01);
      let limitPrice = currentPrice;

      if (strategy === "random") {
        // Random Bots: Mixed Passive/Aggressive
        // 50% chance to cross the spread (Aggressive) to trigger trades
        const isAggressive = Math.random() > 0.5;

        if (action === 'BUY') {
          // Aggressive: Pay MORE (Current + Buffer)
          // Passive: Pay LESS (Current - Buffer)
          limitPrice = isAggressive ? currentPrice + priceBuffer : currentPrice - priceBuffer;
        } else {
          // Aggressive: Sell LOWER (Current - Buffer)
          // Passive: Sell HIGHER (Current + Buffer)
          limitPrice = isAggressive ? currentPrice - priceBuffer : currentPrice + priceBuffer;
        }
      } else {
        // Standard Strategy (Momentum/Swing) - Usually Passive/Maker
        if (action === 'BUY') {
          limitPrice = currentPrice - priceBuffer; // Buy slightly lower
        } else {
          limitPrice = currentPrice + priceBuffer; // Sell slightly higher
        }
      }

      // Constraints
      if (action === 'BUY') {
        const cost = limitPrice * quantity;
        const availableBalance = botAvailableBalance.get(bot.id) || 0;
        if (availableBalance < cost) continue; // Too poor

        // Deduct from tracked balance so we don't overspend on the next stock
        botAvailableBalance.set(bot.id, availableBalance - cost);
      } else {
        if (sharesOwned < quantity) continue; // Not enough shares
      }

      ordersToInsert.push({
        stock_id: stock.id,
        trader_id: bot.id,
        type: action,
        limit_price_cents: Math.max(1, limitPrice),
        quantity: quantity,
        status: 'OPEN'
      });
    }
  }

  // 3. Bulk Execute
  if (ordersToCancelIds.length > 0) {
    console.log(`   ✂️ Cancelling ${ordersToCancelIds.length} stale orders...`);
    await postgres_db
      .update(schema.orders)
      .set({ status: 'CANCELLED' })
      .where(inArray(schema.orders.id, ordersToCancelIds));
  }

  if (ordersToInsert.length > 0) {
    console.log(`   🚀 Placing ${ordersToInsert.length} new orders...`);
    // Batch insert? Drizzle handles it, but let's be safe with chunking if huge. 
    // For now, simple insert is fine as it's unlikely to be > 1000 in one tick.
    if (ordersToInsert.length > 1000) {
      // vigorous safety fallback
      ordersToInsert.length = 1000;
    }

    await postgres_db.insert(schema.orders).values(ordersToInsert);
  }
}

// Start the engine
startBots().catch(e => {
  console.error("Fatal Bot Error:", e);
  process.exit(1);
});