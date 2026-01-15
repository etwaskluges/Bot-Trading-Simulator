import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { postgres_db, schema } from '@vibe-coding-boilerplate/db-drizzle'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'

// 1. SERVER FUNCTION: The "Nuclear" Seed logic
const seedDatabase = createServerFn({ method: 'POST' })
  .validator((data: {
    bots: { name: string, strategy: string, balanceCents: number }[],
    initialSharesMin: number,
    initialSharesMax: number,
    stocks: { symbol: string, name: string, price: number }[]
  }) => data)
  .handler(async ({ data }) => {
    const { bots, initialSharesMin, initialSharesMax, stocks } = data

    try {
      // A. CLEANUP (TRUNCATE ALL)
      await postgres_db.transaction(async (tx) => {
        // Delete all records in order (to respect foreign keys)
        await tx.delete(schema.trades)
        await tx.delete(schema.orders)
        await tx.delete(schema.portfolios)
        await tx.delete(schema.traders)
        await tx.delete(schema.stocks)

        // B. CREATE STOCKS
        const stocksToInsert = stocks.map(s => ({
          symbol: s.symbol,
          name: s.name,
          current_price_cents: s.price,
          total_shares: 1000000,
        }))
        const createdStocks = await tx.insert(schema.stocks).values(stocksToInsert).returning()

        // C. CREATE TRADERS (BOTS)
        const tradersToInsert = bots.map(bot => ({
          name: bot.name,
          is_bot: true,
          strategy: bot.strategy,
          balance_cents: bot.balanceCents,
        }))

        let createdTraders: typeof schema.traders.$inferSelect[] = []
        if (tradersToInsert.length > 0) {
          createdTraders = await tx.insert(schema.traders).values(tradersToInsert).returning()
        }

        // D. ASSIGN INITIAL PORTFOLIOS
        const portfolioData = []
        for (const trader of createdTraders) {
          for (const stock of createdStocks) {
            const sharesOwned = Math.floor(Math.random() * (initialSharesMax - initialSharesMin + 1)) + initialSharesMin
            portfolioData.push({
              trader_id: trader.id,
              stock_id: stock.id,
              shares_owned: sharesOwned,
            })
          }
        }
        if (portfolioData.length > 0) {
          await tx.insert(schema.portfolios).values(portfolioData)
        }
      })

      return {
        success: true,
        message: "Successfully seeded simulation data."
      }
    } catch (error: unknown) {
      console.error("Seed Failed:", error)
      throw new Error(error instanceof Error ? error.message : "Database seeding failed")
    }
  })

// 2. TYPES
type BotConfig = { id: string, name: string, strategy: string, balanceCents: number }
type Stock = { id: string, symbol: string, name: string, price: number }
type StrategyCounts = { Momentum: number, Swing: number, Random: number }

// 3. SUBCOMPONENTS

// Bot Card Component
interface BotCardProps {
  bot: BotConfig
  onRemove: (id: string) => void
  onUpdate: (id: string, field: string, value: string | number) => void
}

function BotCard({ bot, onRemove, onUpdate }: BotCardProps) {
  return (
    <div className="p-4 rounded-2xl border border-border/50 bg-background/50 relative group flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onRemove(bot.id)}
        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
      >
        <X size={14} />
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor={`bot-name-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Name</label>
          <input
            id={`bot-name-${bot.id}`}
            value={bot.name}
            onChange={(e) => onUpdate(bot.id, 'name', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
          />
        </div>
        <div>
          <label htmlFor={`bot-strategy-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Strategy</label>
          <select
            id={`bot-strategy-${bot.id}`}
            value={bot.strategy}
            onChange={(e) => onUpdate(bot.id, 'strategy', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase outline-none focus:ring-2 focus:ring-primary/10 transition-all"
          >
            <option value="Momentum">Momentum</option>
            <option value="Swing">Swing</option>
            <option value="Random">Random</option>
          </select>
        </div>
        <div>
          <label htmlFor={`bot-balance-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Cash($)</label>
          <div className="relative">
            <input
              id={`bot-balance-${bot.id}`}
              type="number"
              value={bot.balanceCents / 100}
              onChange={(e) => onUpdate(bot.id, 'balanceCents', Number(e.target.value) * 100)}
              className="w-full bg-background border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-[10px]">$</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Manual Bot Config Component
interface ManualBotConfigProps {
  bots: BotConfig[]
  isOpen: boolean
  onToggle: () => void
  onAddBot: () => void
  onRemoveBot: (id: string) => void
  onUpdateBot: (id: string, field: string, value: string | number) => void
}

function ManualBotConfig({ bots, isOpen, onToggle, onAddBot, onRemoveBot, onUpdateBot }: ManualBotConfigProps) {
  return (
    <div className="-mx-6 border-t border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'}`}>
            <Bot size={16} />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap">
            Manual Bot Config
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-bold">
            {bots.length} UNITS
          </div>
          {isOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1000px] opacity-100 px-6 pb-4 pt-0' : 'max-h-0 opacity-0'}`}>
        <div className="space-y-3 pt-4 border-t border-border/30">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-medium italic">Individual Fleet Control</p>
            <button
              type="button"
              onClick={onAddBot}
              className="p-1 hover:bg-primary/10 rounded-md text-primary transition-colors"
              title="Add Bot"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>

          <div className="space-y-2">
            {bots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                onRemove={onRemoveBot}
                onUpdate={onUpdateBot}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Quick Bot Config Form Component
interface QuickBotConfigFormProps {
  strategyCounts: StrategyCounts
  initialBalance: number
  sharesMin: number
  sharesMax: number
  syncQuickConfig: boolean
  onStrategyCountsChange: (counts: StrategyCounts) => void
  onInitialBalanceChange: (balance: number) => void
  onSharesMinChange: (min: number) => void
  onSharesMaxChange: (max: number) => void
  onSyncToggle: (sync: boolean) => void
}

function QuickBotConfigForm({
  strategyCounts,
  initialBalance,
  sharesMin,
  sharesMax,
  syncQuickConfig,
  onStrategyCountsChange,
  onInitialBalanceChange,
  onSharesMinChange,
  onSharesMaxChange,
  onSyncToggle
}: QuickBotConfigFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(strategyCounts) as Array<keyof typeof strategyCounts>).map((strat) => (
          <div key={strat}>
            <label htmlFor={`strategy-${strat}`} className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">{strat}</label>
            <input
              id={`strategy-${strat}`}
              type="number"
              value={strategyCounts[strat]}
              onChange={(e) => onStrategyCountsChange({ ...strategyCounts, [strat]: Number(e.target.value) })}
              className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-xs"
            />
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="initial-balance" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Default Bot Balance($)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs">$</span>
          <input
            id="initial-balance"
            type="number"
            value={initialBalance / 100}
            onChange={(e) => onInitialBalanceChange(Number(e.target.value) * 100)}
            className="w-full bg-muted/30 border border-border/50 rounded-xl pl-8 pr-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="shares-min" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Min Initial Shares</label>
          <input
            id="shares-min"
            type="number"
            value={sharesMin}
            onChange={(e) => onSharesMinChange(Number(e.target.value))}
            className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
        <div>
          <label htmlFor="shares-max" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Max Initial Shares</label>
          <input
            id="shares-max"
            type="number"
            value={sharesMax}
            onChange={(e) => onSharesMaxChange(Number(e.target.value))}
            className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-dashed border-muted-foreground/10">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={syncQuickConfig}
              onChange={(e) => onSyncToggle(e.target.checked)}
              className="peer sr-only"
            />
            <div className="w-10 h-6 bg-muted rounded-full peer-checked:bg-primary transition-all duration-300" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-all duration-300 shadow-sm" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-widest block text-primary/80">Sync to Manual Config</span>
            <p className="text-[9px] text-muted-foreground font-medium italic">Automatically update the fleet when quick settings change.</p>
          </div>
        </label>
      </div>
    </div>
  )
}

// Bot Config Panel Component (Left Panel)
interface BotConfigPanelProps {
  strategyCounts: StrategyCounts
  initialBalance: number
  sharesMin: number
  sharesMax: number
  syncQuickConfig: boolean
  bots: BotConfig[]
  isAdvancedOpen: boolean
  onStrategyCountsChange: (counts: StrategyCounts) => void
  onInitialBalanceChange: (balance: number) => void
  onSharesMinChange: (min: number) => void
  onSharesMaxChange: (max: number) => void
  onSyncToggle: (sync: boolean) => void
  onAdvancedToggle: () => void
  onAddBot: () => void
  onRemoveBot: (id: string) => void
  onUpdateBot: (id: string, field: string, value: string | number) => void
}

function BotConfigPanel({
  strategyCounts,
  initialBalance,
  sharesMin,
  sharesMax,
  syncQuickConfig,
  bots,
  isAdvancedOpen,
  onStrategyCountsChange,
  onInitialBalanceChange,
  onSharesMinChange,
  onSharesMaxChange,
  onSyncToggle,
  onAdvancedToggle,
  onAddBot,
  onRemoveBot,
  onUpdateBot
}: BotConfigPanelProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-2xl border shadow-lg flex flex-col h-[500px]">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Users size={16} className="text-primary" />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap">
            Quick Bot Config
          </span>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin scrollbar-thumb-muted">
          <QuickBotConfigForm
            strategyCounts={strategyCounts}
            initialBalance={initialBalance}
            sharesMin={sharesMin}
            sharesMax={sharesMax}
            syncQuickConfig={syncQuickConfig}
            onStrategyCountsChange={onStrategyCountsChange}
            onInitialBalanceChange={onInitialBalanceChange}
            onSharesMinChange={onSharesMinChange}
            onSharesMaxChange={onSharesMaxChange}
            onSyncToggle={onSyncToggle}
          />

          <ManualBotConfig
            bots={bots}
            isOpen={isAdvancedOpen}
            onToggle={onAdvancedToggle}
            onAddBot={onAddBot}
            onRemoveBot={onRemoveBot}
            onUpdateBot={onUpdateBot}
          />
        </div>
      </div>
    </div>
  )
}

// Stock Card Component
interface StockCardProps {
  stock: Stock
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Stock, value: string | number) => void
}

function StockCard({ stock, onRemove, onUpdate }: StockCardProps) {
  return (
    <div className="p-4 rounded-2xl border bg-muted/30 hover:bg-muted/50 transition-all flex flex-col gap-3 relative group">
      <button
        type="button"
        onClick={() => onRemove(stock.id)}
        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
      >
        <X size={14} />
      </button>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 text-center">
          <label htmlFor={`stock-symbol-${stock.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracing-widest mb-1 block">Ticker</label>
          <input
            id={`stock-symbol-${stock.id}`}
            value={stock.symbol}
            onChange={(e) => onUpdate(stock.id, 'symbol', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-2 py-1.5 text-[10px] font-mono font-bold text-center uppercase focus:ring-2 focus:ring-primary/10 outline-none transition-all"
          />
        </div>
        <div className="col-span-2">
          <label htmlFor={`stock-name-${stock.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracing-widest mb-1 block">Company Name</label>
          <input
            id={`stock-name-${stock.id}`}
            value={stock.name}
            onChange={(e) => onUpdate(stock.id, 'name', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`stock-price-${stock.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracing-widest mb-1 block">Initial Price(cents)</label>
        <div className="relative">
          <input
            id={`stock-price-${stock.id}`}
            type="number"
            value={stock.price}
            onChange={(e) => onUpdate(stock.id, 'price', Number(e.target.value))}
            className="w-full bg-background border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-[10px]">$</span>
        </div>
      </div>
    </div>
  )
}

// Stock Config Panel Component (Right Panel)
interface StockConfigPanelProps {
  stocks: Stock[]
  onAddStock: () => void
  onRemoveStock: (id: string) => void
  onUpdateStock: (id: string, field: keyof Stock, value: string | number) => void
}

function StockConfigPanel({ stocks, onAddStock, onRemoveStock, onUpdateStock }: StockConfigPanelProps) {
  return (
    <div className="bg-card p-6 rounded-2xl border shadow-lg flex flex-col h-[500px]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <TrendingUp size={16} className="text-primary" />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap">
            Asset Config
          </span>
        </div>
        <button
          type="button"
          onClick={onAddStock}
          className="p-1.5 hover:bg-primary/10 rounded-lg text-primary transition-colors"
          title="Add Asset"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted">
        {stocks.map((stock) => (
          <StockCard
            key={stock.id}
            stock={stock}
            onRemove={onRemoveStock}
            onUpdate={onUpdateStock}
          />
        ))}
      </div>
    </div>
  )
}

// Seed Action Component
interface SeedActionProps {
  isSeeding: boolean
  status: { type: 'success' | 'error', message: string } | null
  onSeed: () => void
}

function SeedAction({ isSeeding, status, onSeed }: SeedActionProps) {
  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={onSeed}
          disabled={isSeeding}
          className={`relative px-8 py-3 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2.5 transition-all duration-300 shadow-lg min-w-[200px] justify-center ${isSeeding
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-95'
            }`}
        >
          {isSeeding ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span className="animate-pulse">Initializing...</span>
            </>
          ) : (
            <>
              <Zap size={16} className="fill-current" />
              Start Seeding
            </>
          )}
        </button>

        {status && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <div className={
              `px-5 py-2.5 rounded-xl border flex items-center gap-2.5 shadow-sm ${status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-red-500/10 border-red-500/20 text-red-600'
              }`
            }>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
              <p className="text-[10px] font-bold">{status.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 4. MAIN PAGE COMPONENT
function SeedPage() {
  const [strategyCounts, setStrategyCounts] = useState({
    Momentum: 2,
    Swing: 2,
    Random: 2
  })
  const [initialBalance, setInitialBalance] = useState(100000) // $1,000.00
  const [sharesMin, setSharesMin] = useState(50)
  const [sharesMax, setSharesMax] = useState(200)

  const [syncQuickConfig, setSyncQuickConfig] = useState(true)

  // Bot List State (Individual Editing)
  const [bots, setBots] = useState<BotConfig[]>([])
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  const [stocks, setStocks] = useState<Stock[]>([
    { id: '1', symbol: 'VIBE', name: 'Vibe Coding Inc.', price: 10000 },
    { id: '2', symbol: 'TECH', name: 'Tech Innovations Corp.', price: 5000 },
    { id: '3', symbol: 'GROW', name: 'Growth Enterprises Ltd.', price: 7500 },
  ])

  const [isSeeding, setIsSeeding] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Sync Bot List with Quick Config (Auto-sync logic)
  useEffect(() => {
    if (!syncQuickConfig) return

    const newBots: BotConfig[] = []
    // biome-ignore lint/complexity/noForEach: <explanation>
    Object.entries(strategyCounts).forEach(([strategy, count]) => {
      for (let i = 1; i <= count; i++) {
        newBots.push({
          id: Math.random().toString(36).substr(2, 9),
          name: `${strategy} Bot ${i}`,
          strategy: strategy,
          balanceCents: initialBalance
        })
      }
    })
    setBots(newBots)
  }, [strategyCounts, initialBalance, syncQuickConfig])

  const handleAddBot = () => {
    setSyncQuickConfig(false)
    setBots([...bots, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Bot',
      strategy: 'Momentum',
      balanceCents: initialBalance
    }])
  }

  const handleRemoveBot = (id: string) => {
    setSyncQuickConfig(false)
    setBots(bots.filter(b => b.id !== id))
  }

  const handleUpdateBot = (id: string, field: string, value: string | number) => {
    setSyncQuickConfig(false)
    setBots(bots.map(b => b.id === id ? { ...b, [field]: value } : b))
  }

  const handleAddStock = () => {
    setStocks([...stocks, { id: Math.random().toString(36).substr(2, 9), symbol: 'NEW', name: 'New Company', price: 1000 }])
  }

  const handleRemoveStock = (id: string) => {
    setStocks(stocks.filter((s) => s.id !== id))
  }

  const handleUpdateStock = (id: string, field: keyof Stock, value: string | number) => {
    setStocks(stocks.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    setStatus(null)

    try {
      const result = await seedDatabase({
        data: {
          bots: bots.map(b => ({
            name: b.name,
            strategy: b.strategy,
            balanceCents: b.balanceCents
          })),
          initialSharesMin: sharesMin,
          initialSharesMax: sharesMax,
          stocks
        }
      })
      setStatus({ type: 'success', message: result.message })
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'An error occurred' })
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <BotConfigPanel
            strategyCounts={strategyCounts}
            initialBalance={initialBalance}
            sharesMin={sharesMin}
            sharesMax={sharesMax}
            syncQuickConfig={syncQuickConfig}
            bots={bots}
            isAdvancedOpen={isAdvancedOpen}
            onStrategyCountsChange={setStrategyCounts}
            onInitialBalanceChange={setInitialBalance}
            onSharesMinChange={setSharesMin}
            onSharesMaxChange={setSharesMax}
            onSyncToggle={setSyncQuickConfig}
            onAdvancedToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
            onUpdateBot={handleUpdateBot}
          />

          <StockConfigPanel
            stocks={stocks}
            onAddStock={handleAddStock}
            onRemoveStock={handleRemoveStock}
            onUpdateStock={handleUpdateStock}
          />
        </div>

        <SeedAction
          isSeeding={isSeeding}
          status={status}
          onSeed={handleSeed}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/seeding_area/')({
  component: SeedPage,
})
