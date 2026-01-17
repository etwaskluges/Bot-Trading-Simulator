import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  CheckCircle2,
  Loader2,
  Plus,
  ShieldAlert,
  TrendingUp,
  X,
  Zap
} from 'lucide-react'
import { useState } from 'react'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import type { Database } from '~/types/supabase'


// 1. SERVER FUNCTION: The "Nuclear" Seed logic
const seedDatabase = createServerFn({ method: 'POST' })
  .validator((data: {
    stocks: { symbol: string, name: string, price: number }[]
  }) => data)
  .handler(async ({ data }) => {
    const { stocks } = data

    try {
      const supabase = getSupabaseServerClient()

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('Unable to determine authenticated user.')
      }

      const { error: stocksError } = await supabase
        .from('stocks')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (stocksError) {
        throw new Error(stocksError.message)
      }

      const stocksToInsert = stocks.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        current_price_cents: stock.price,
        total_shares: 1000000,
      }))

      const { error: stockError } = await supabase
        .from('stocks')
        .upsert(stocksToInsert, { onConflict: 'symbol' })

      if (stockError) {
        throw new Error(stockError.message)
      }


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
type Stock = { id: string, symbol: string, name: string, price: number }

// 3. SUBCOMPONENTS

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
  const [stocks, setStocks] = useState<Stock[]>([
    { id: '1', symbol: 'VIBE', name: 'Vibe Coding Inc.', price: 10000 },
    { id: '2', symbol: 'TECH', name: 'Tech Innovations Corp.', price: 5000 },
    { id: '3', symbol: 'GROW', name: 'Growth Enterprises Ltd.', price: 7500 },
  ])

  const [isSeeding, setIsSeeding] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

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
        <div className="flex justify-center">
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

export const Route = createFileRoute('/_authenticated/_app/seeding-area/')({
  component: SeedPage,
})
