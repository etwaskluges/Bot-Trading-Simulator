import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TrendingUp, ArrowRight, LayoutDashboard, Shield, Bot, Activity, Settings, Edit3, UserCheck, Database } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import { Button } from '~/lib/components/ui/button'

// Server function to update user role to moderator
const updateUserRoleToModerator = createServerFn()
  .handler(async () => {
    const supabase = getSupabaseServerClient()

    // Call the RPC function to update user role
    const { error } = await supabase.rpc('update_user_role_to_moderator')

    if (error) {
      throw new Error(`Failed to update user role: ${error.message}`)
    }

    return { success: true }
  })

export const Route = createFileRoute('/_authenticated/_app/home/')({
  component: LandingPage,
})

function LandingPage() {
  // Mutation to update user role
  const updateRoleMutation = useMutation({
    mutationFn: () => updateUserRoleToModerator(),
    onSuccess: () => {
      toast.success('Role updated to moderator! Refresh the page to see changes.')
    },
    onError: (error) => {
      toast.error(`Failed to update role: ${error.message}`)
    },
  })

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 overflow-x-hidden">
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

        {/* SEPARATOR */}
        <div className="h-px w-full bg-border/50" />

          {/* ADMIN CONTROLS */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 pb-3">
              <div className="p-2 bg-primary/5 rounded-full">
                <Shield size={20} className="text-primary" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Admin Controls</h2>
            </div>

            {/* ELEVATE PERMISSIONS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-lg bg-card/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <UserCheck size={16} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-foreground text-sm">Elevate Permissions</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Grant moderator access for advanced system management
                  </p>
                </div>
              </div>

              <Button
                onClick={() => updateRoleMutation.mutate()}
                disabled={updateRoleMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600 text-primary-foreground hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-orange-600/25 w-full md:w-auto"
                size="default"
              >
                {updateRoleMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    Make Moderator
                  </>
                )}
              </Button>
            </div>

            {/* CONFIGURE ENVIRONMENT */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-lg bg-card/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Database size={16} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-foreground text-sm">Configure Environment</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Set up asset catalogs and start the live exchange
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">

                <Button
                  asChild
                  className="hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-primary/25 w-full sm:w-auto"
                  size="default"
                >
                  <Link to="/market-config">
                    Configure Market
                  </Link>
                </Button>
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
