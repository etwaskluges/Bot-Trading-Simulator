import { Engine, RuleProperties } from 'json-rules-engine'
import { eq, postgres_db, schema } from '@vibe-coding-boilerplate/db-drizzle'

type PortfolioPosition = {
  stockId: string
  symbol: string
  name: string
  sharesOwned: number
  price: number
}

type StrategyWithPortfolios = {
  strategyId: string
  botId: string
  botName: string | null
  rules: RuleProperties[]
  portfolios: PortfolioPosition[]
}

async function fetchStrategiesFromDb(): Promise<StrategyWithPortfolios[]> {
  const rows = await postgres_db
    .select({
      strategyId: schema.strategies.id,
      rules: schema.strategies.rules,
      botId: schema.traders.id,
      botName: schema.traders.name,
      portfolioStockId: schema.portfolios.stock_id,
      sharesOwned: schema.portfolios.shares_owned,
      stockSymbol: schema.stocks.symbol,
      stockName: schema.stocks.name,
      stockPrice: schema.stocks.current_price_cents,
    })
    .from(schema.traders)
    .where(eq(schema.traders.is_bot, true))
    .leftJoin(schema.strategies, eq(schema.traders.strategy_id, schema.strategies.id))
    .leftJoin(schema.portfolios, eq(schema.portfolios.trader_id, schema.traders.id))
    .leftJoin(schema.stocks, eq(schema.portfolios.stock_id, schema.stocks.id))
  .orderBy(schema.traders.name)

  const grouped = new Map<string, StrategyWithPortfolios>()

  for (const row of rows) {
    const strategyId = row.strategyId
    if (!strategyId) {
      continue
    }

    const rules = normalizeRules(row.rules)

    if (!grouped.has(strategyId)) {
      grouped.set(strategyId, {
        strategyId,
        botId: row.botId,
        botName: row.botName ?? null,
        rules,
        portfolios: [],
      })
    }

    if (row.portfolioStockId && row.stockSymbol) {
      grouped.get(strategyId)!.portfolios.push({
        stockId: row.portfolioStockId,
        symbol: row.stockSymbol,
        name: row.stockName ?? 'Unknown',
        sharesOwned: Number(row.sharesOwned ?? 0),
        price: Number(row.stockPrice ?? 0),
      })
    }
  }

  return Array.from(grouped.values())
}

function normalizeRules(raw: unknown): RuleProperties[] {
  if (Array.isArray(raw)) {
    return raw.filter((rule): rule is RuleProperties => {
      return typeof rule === 'object' &&
             rule !== null &&
             typeof rule === 'object' &&
             'conditions' in rule &&
             'event' in rule
    })
  }
  return []
}

function buildFacts(position: PortfolioPosition | null) {
  const shares = position?.sharesOwned ?? 0
  const price = position?.price ?? 0

  // Calculate more realistic volatility based on price movement patterns
  // This is a simplified calculation - in a real system this would come from historical data
  const baseVolatility = 0.02 // 2% base volatility
  const positionVolatility = shares > 0 ? Math.min(0.05, shares / 10000) : 0 // Add up to 5% based on position size
  const volatility = Math.min(0.1, baseVolatility + positionVolatility)

  return {
    hasPosition: shares > 0,
    openOrders: 0, // TODO: This should be fetched from the database
    volatility,
    rsi: shares > 0 ? 65 : 35, // TODO: This should be calculated from actual price data
    emaFastAboveSlow: true, // TODO: This should be calculated from actual price data
    stockSymbol: position?.symbol ?? 'unknown',
    sharesOwned: shares,
    currentPrice: price,
  }
}

async function evaluateStrategy(strategy: StrategyWithPortfolios) {
  if (!strategy.rules.length) {
    console.log(`Strategy ${strategy.strategyId} has no rules, skipping`)
    return
  }

  const engine = new Engine()

  try {
    strategy.rules.forEach((rule) => engine.addRule(rule))
  } catch (error) {
    console.error(`Failed to add rules for strategy ${strategy.strategyId}:`, error)
    return
  }

  const portfolios = strategy.portfolios.length ? strategy.portfolios : [null]

  for (const portfolio of portfolios) {
    try {
      const facts = buildFacts(portfolio)
      const { events } = await engine.run(facts)

      const target = portfolio ? `${portfolio.symbol} (${portfolio.sharesOwned} shares)` : 'empty portfolio'

      if (events.length === 0) {
        console.log(`[${strategy.botName ?? strategy.botId}] ${target} -> NO_ACTION`)
        continue
      }

      // Log all events for this portfolio
      events.forEach((event, index) => {
        console.log(
          `[${strategy.botName ?? strategy.botId}] ${target} -> ${event.type}${index > 0 ? ` (${index + 1})` : ''}`,
          event.params || {},
        )
      })
    } catch (error) {
      const target = portfolio ? `${portfolio.symbol} (${portfolio.sharesOwned} shares)` : 'empty portfolio'
      console.error(`Error evaluating strategy ${strategy.strategyId} for ${target}:`, error)
    }
  }
}

async function main() {
  try {
    console.log('Starting bot evaluation...')

    const strategies = await fetchStrategiesFromDb()
    if (!strategies.length) {
      console.log('No bot strategies found in the database.')
      return
    }

    console.log(`Found ${strategies.length} bot strategies to evaluate`)

    for (const strategy of strategies) {
      try {
        await evaluateStrategy(strategy)
      } catch (error) {
        console.error(`Failed to evaluate strategy ${strategy.strategyId}:`, error)
      }
    }

    console.log('Bot evaluation completed')
  } catch (error) {
    console.error('Fatal error in main function:', error)
    throw error
  }
}

main().catch((error) => {
  console.error('Fatal Bot Error:', error)
  process.exit(1)
})
