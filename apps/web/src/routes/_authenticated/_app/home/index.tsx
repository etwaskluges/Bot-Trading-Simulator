import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TrendingUp, ArrowRight, LayoutDashboard, Bot, Edit3 } from 'lucide-react'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'

// Server function to check if setup is needed
const checkSetupRequired = createServerFn()
  .handler(async () => {
    const supabase = getSupabaseServerClient()

    // Check if stocks table is empty
    const { count: stocksCount, error: stocksError } = await supabase
      .from('stocks')
      .select('*', { count: 'exact', head: true })

    if (stocksError) {
      throw new Error(`Failed to check stocks: ${stocksError.message}`)
    }

    // Get user count from view
    const { data: userCountData, error: userCountError } = await supabase
      .from('usercount')
      .select('user_count')

    if (userCountError) {
      throw new Error(`Failed to get user count: ${userCountError.message}`)
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      throw new Error(`Failed to get user: ${userError.message}`)
    }

    const userCount = userCountData?.[0]?.user_count || 0
    const isStocksEmpty = stocksCount === 0
    const isModerator = (user as any)?.exchange_role === 'moderator'
    const isFirstUser = userCount === 1
    const shouldRedirect = isStocksEmpty && (isFirstUser || isModerator)

    console.log({
      stocksCount,
      userCountData,
      user,
      userCount,
      isStocksEmpty,
      isModerator,
      isFirstUser,
      shouldRedirect
    })

    return {
      shouldRedirect,
      isStocksEmpty,
      userCount,
      isModerator,
      isFirstUser
    }
  })


export const Route = createFileRoute('/_authenticated/_app/home/')({
  beforeLoad: async () => {
    const setupCheck = await checkSetupRequired()

    if (setupCheck.shouldRedirect) {
      throw redirect({ to: '/setup' })
    }
  },
  component: LandingPage,
})

function LandingPage() {

  return (
    <div className="bg-background p-3 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-8 md:space-y-12">

        {/* HERO SECTION */}
        <div className="text-center space-y-8 pty-6 pby-3">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-2 bg-primary/5 rounded-full">
              <LayoutDashboard size={20} className="text-primary" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bot Trading Simulator v1.0</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
              Command Your <span className="text-primary">Market.</span>
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base font-medium leading-relaxed">
              A high-performance bot trading simulation environment. Seed your assets, deploy your fleet, and watch the market evolve in real-time.
            </p>
          </div>
        </div>

        {/* MAIN ACTIONS */}
        <div className="space-y-12">

          {/* WORKFLOW STEPS */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8 max-w-6xl mx-auto">

              {/* STEP 1: Strategy Editor */}
              <div className="flex flex-col items-center gap-3 w-full lg:w-auto">
                <Link
                  to="/strategy-editor"
                  className="group flex flex-col items-center gap-3 p-4 rounded-xl transition-all hover:bg-card/30 w-full max-w-sm"
                >
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    <Edit3 size={20} />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Strategy Editor</h3>
                    <p className="text-sm text-muted-foreground font-medium">Create and edit trading strategies</p>
                  </div>
                </Link>
              </div>

              {/* ARROW RIGHT */}
              <div className="hidden lg:flex items-center gap-2">
                <div className="h-px w-8 bg-border"></div>
                <ArrowRight size={16} className="text-muted-foreground" />
                <div className="h-px w-8 bg-border"></div>
              </div>

              {/* STEP 2: Bot Studio */}
              <div className="flex flex-col items-center gap-3 w-full lg:w-auto">
                <Link
                  to="/bot-studio"
                  className="group flex flex-col items-center gap-3 p-4 rounded-xl transition-all hover:bg-card/30 w-full max-w-sm"
                >
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                    <Bot size={20} />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Bot Studio</h3>
                    <p className="text-sm text-muted-foreground font-medium">Set up bot configurations and control sessions</p>
                  </div>
                </Link>
              </div>

              {/* ARROW RIGHT */}
              <div className="hidden lg:flex items-center gap-2">
                <div className="h-px w-8 bg-border"></div>
                <ArrowRight size={16} className="text-muted-foreground" />
                <div className="h-px w-8 bg-border"></div>
              </div>

              {/* STEP 3: Live Exchange */}
              <div className="flex flex-col items-center gap-3 w-full lg:w-auto">
                <Link
                  to="/live-exchange"
                  className="group flex flex-col items-center gap-3 p-4 rounded-xl transition-all hover:bg-card/30 w-full max-w-sm"
                >
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    <TrendingUp size={20} />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Live Exchange</h3>
                    <p className="text-sm text-muted-foreground font-medium">Monitor real-time trading and analytics</p>
                  </div>
                </Link>
              </div>

            </div>
          </div>

        </div>

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
