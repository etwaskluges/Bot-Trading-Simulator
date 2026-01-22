import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import { Shield, CheckCircle2, Loader2, Plus, Play, X, BarChartIcon, Users } from 'lucide-react'
import { Button } from '~/lib/components/ui/button'
import { isCurrentUserModeratorFn } from '~/lib/server/isCurrentUserModerator'

// Server function to check user count and role
const checkUserStatus = createServerFn()
  .handler(async () => {
    const supabase = getSupabaseServerClient()

    // Get user count from view
    const { data: userCountData, error: userCountError } = await supabase
      .from('usercount')
      .select('user_count')

    if (userCountError) {
      throw new Error(`Failed to get user count: ${userCountError.message}`)
    }

    // Check if current user is moderator using the shared helper
    const isModerator = await isCurrentUserModeratorFn()

    const userCount = userCountData?.[0]?.user_count || 0
    const isFirstUser = userCount === 1

    return {
      userCount,
      userRole: isModerator ? 'moderator' : 'user',
      shouldAutoUpgrade: isFirstUser && !isModerator
    }
  })

// Server function to update user role to moderator
const updateUserRoleToModerator = createServerFn()
  .handler(async () => {
    const supabase = getSupabaseServerClient()

    // Call the RPC function to update user role
    const { error } = await (supabase.rpc as any)('make_user_moderator')

    if (error) {
      throw new Error(`Failed to update user role: ${error.message}`)
    }

    return { success: true }
  })

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
import type { User } from '~/routes/__root'

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
    <div className="p-4 bg-muted/30 hover:bg-muted/50 transition-all flex flex-col gap-3 relative group">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(stock.id)}
        className="absolute top-0 right-2 hover:bg-red-500/10 text-red-500"
      >
        <X size={14} />
      </Button>

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
    <div className="flex flex-col min-h-[500px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/5 rounded-full">
          <BarChartIcon size={20} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Market Configurator</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted">
        {stocks.map((stock, index) => (
          <div key={stock.id}>
            <StockCard
              stock={stock}
              onRemove={onRemoveStock}
              onUpdate={onUpdateStock}
            />
            {index < stocks.length - 1 && (
              <div className="h-px w-full bg-border/50 my-3" />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/10">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddStock}
         >
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add Asset
        </Button>
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
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center gap-6">
        <Button
          type="button"
          variant="default"
          onClick={onSeed}
          disabled={isSeeding}
        >
          {isSeeding ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span className="animate-pulse">Initializing...</span>
            </>
          ) : (
            <>
              <Play size={16} className="fill-current" />
              Start Seeding
            </>
          )}
        </Button>

        {status && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <div className={
              `px-5 py-2.5 flex items-center gap-2.5 ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
              }`
            }>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <Shield size={16} />}
              <p className="text-[10px] font-bold">{status.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Market Configurator Component
function MarketConfigurator() {
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
    <div className="space-y-8">
      <StockConfigPanel
        stocks={stocks}
        onAddStock={handleAddStock}
        onRemoveStock={handleRemoveStock}
        onUpdateStock={handleUpdateStock}
      />

      <SeedAction
        isSeeding={isSeeding}
        status={status}
        onSeed={handleSeed}
      />
    </div>
  )
}



export const Route = createFileRoute('/_authenticated/_app/setup/')({
  component: RouteComponent,
})

function RouteComponent() {
  // Query to check user status
  const { data: userStatus } = useQuery({
    queryKey: ['user-status'],
    queryFn: () => checkUserStatus(),
  })

  // Mutation to update user role
  const updateRoleMutation = useMutation({
    mutationFn: () => updateUserRoleToModerator(),
  })

  // Auto-upgrade first user to moderator
  useEffect(() => {
    if (userStatus?.shouldAutoUpgrade && !updateRoleMutation.isPending && !updateRoleMutation.isSuccess) {
      updateRoleMutation.mutate()
    }
  }, [userStatus?.shouldAutoUpgrade, updateRoleMutation])

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-8 md:space-y-12">

        {/* HEADER */}
        <div className="text-center space-y-8 pty-6 pby-3">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-2 bg-primary/5 rounded-full">
              <Shield size={20} className="text-primary" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Setup & Configuration</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
              Setup Your <span className="text-primary">Trading Environment</span>
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base font-medium leading-relaxed">
              Configure your bot trading simulator with assets
            </p>
          </div>
        </div>

        {/* FIRST USER CHECK */}
        {userStatus?.shouldAutoUpgrade && updateRoleMutation.isSuccess && (
          <div className="max-w-md mx-auto">
            <div className="text-center text-orange-600 font-semibold text-sm bg-orange-50 px-6 py-4 rounded-lg border border-orange-200">
              First setup: Your account was upgraded to the role 'moderator'
            </div>
          </div>
        )}

        {/* MARKET CONFIGURATOR */}
        <MarketConfigurator />

        {/* SEPARATOR */}
        <div className="h-px w-full bg-border/50" />


        {/* FOOTER */}
        <div className="text-center py-8">
          <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">
            Precision Engineering for Synthetic Markets
          </p>
        </div>

      </div>
    </div>
  )
}
