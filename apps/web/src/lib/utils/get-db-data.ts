import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, postgres_db, schema, sql } from '@vibe-coding-boilerplate/db-drizzle'

export type StockTickerItem = {
  symbol: string
  name: string
  currentPrice: number
  previousPrice: number | null
  percentChange: number
}

export const getStockTickerData = createServerFn({ method: 'GET' }).handler(async (): Promise<StockTickerItem[]> => {
  const allStocks = await postgres_db
    .select()
    .from(schema.stocks)
    .orderBy(schema.stocks.symbol)

  const lastMinuteTrades = await postgres_db
    .select({
      stockId: schema.trades.stock_id,
      executionPrice: schema.trades.execution_price_cents,
      executedAt: schema.trades.executed_at,
    })
    .from(schema.trades)

  const tradesByStockId = new Map<string, number[]>()
  lastMinuteTrades.forEach(trade => {
    if (!tradesByStockId.has(trade.stockId)) {
      tradesByStockId.set(trade.stockId, [])
    }
    tradesByStockId.get(trade.stockId)!.push(trade.executionPrice)
  })

  const averagePriceByStockId = new Map<string, number>()
  tradesByStockId.forEach((prices, stockId) => {
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length
    averagePriceByStockId.set(stockId, Math.round(averagePrice))
  })

  return allStocks.map(stock => {
    const currentPrice = stock.current_price_cents / 100
    const previousPriceCents = averagePriceByStockId.get(stock.id)
    const previousPrice = previousPriceCents ? previousPriceCents / 100 : null
    const percentChange = previousPrice
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : 0

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice,
      previousPrice,
      percentChange,
    }
  })
})

export type Timespan = '5m' | '10m' | '1h' | '1d'

export const getAllMarketStocks = createServerFn({ method: 'GET' }).handler(async () => {
  const stocks = await postgres_db
    .select()
    .from(schema.stocks)
    .orderBy(schema.stocks.symbol)

  return stocks
})

export const getMarketDataForSymbol = createServerFn({ method: 'GET' })
  .validator((data: { symbol: string, timespan: Timespan }) => data)
  .handler(async ({ data }) => {
    const { symbol, timespan } = data

    const stocks = await postgres_db
      .select()
      .from(schema.stocks)
      .where(eq(schema.stocks.symbol, symbol))
      .limit(1)

    if (!stocks.length) return null
    const stock = stocks[0]

    let intervalValue: ReturnType<typeof sql>
    let bucketSql: ReturnType<typeof sql> | null
    switch (timespan) {
      case '5m':
        intervalValue = sql`now() - interval '5 minutes'`
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 2) * 2)`
        break
      case '10m':
        intervalValue = sql`now() - interval '10 minutes'`
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 4) * 4)`
        break
      case '1h':
        intervalValue = sql`now() - interval '1 hour'`
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 25) * 25)`
        break
      case '1d':
        intervalValue = sql`now() - interval '1 day'`
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 600) * 600)`
        break
      default:
        intervalValue = sql`now() - interval '5 minutes'`
        bucketSql = null
        break
    }

    const trades = bucketSql
      ? await postgres_db
        .select({
          executed_at: sql<string>`${bucketSql}`.as('executed_at'),
          execution_price_cents: sql<string>`avg(${schema.trades.execution_price_cents})`.as('execution_price_cents'),
        })
        .from(schema.trades)
        .where(and(
          eq(schema.trades.stock_id, stock.id),
          sql`${schema.trades.executed_at} >= ${intervalValue}`
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1 desc`)
        .limit(1000)
      : await postgres_db
        .select()
        .from(schema.trades)
        .where(and(
          eq(schema.trades.stock_id, stock.id),
          sql`${schema.trades.executed_at} >= ${intervalValue}`
        ))
        .orderBy(desc(schema.trades.executed_at))
        .limit(1000)

    const orders = await postgres_db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.stock_id, stock.id),
          eq(schema.orders.status, 'OPEN')
        )
      )
      .orderBy(desc(schema.orders.created_at))

    const botPortfolios = await postgres_db
      .select({
        trader_id: schema.traders.id,
        trader_name: schema.traders.name,
        strategy: schema.traders.strategy,
        balance_cents: schema.traders.balance_cents,
        shares_owned: schema.portfolios.shares_owned,
        user_id: schema.traders.user_id,
      })
      .from(schema.traders)
      .innerJoin(schema.portfolios, eq(schema.traders.id, schema.portfolios.trader_id))
      .where(
        and(
          eq(schema.traders.is_bot, true),
          eq(schema.portfolios.stock_id, stock.id)
        )
      )

    botPortfolios.sort((a, b) =>
      (a.trader_name || '').localeCompare(b.trader_name || '', undefined, { numeric: true, sensitivity: 'base' })
    )

    const recentBotOrders = await postgres_db
      .select({
        trader_id: schema.orders.trader_id,
        type: schema.orders.type,
        quantity: schema.orders.quantity,
        limit_price_cents: schema.orders.limit_price_cents,
        status: schema.orders.status,
      })
      .from(schema.orders)
      .innerJoin(schema.traders, eq(schema.orders.trader_id, schema.traders.id))
      .where(
        and(
          eq(schema.orders.stock_id, stock.id),
          eq(schema.traders.is_bot, true)
        )
      )
      .orderBy(desc(schema.orders.created_at))
      .limit(50)

    return {
      stock,
      trades: trades.reverse(),
      orders,
      botPortfolios,
      recentBotOrders
    }
  })
