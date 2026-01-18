import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TrendingUp, Zap, ArrowRight, LayoutDashboard, Database, Shield } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'

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
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4 mx-auto">
            <LayoutDashboard size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Bot Trading Simulator v1.0</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
            Command Your <span className="text-primary">Market.</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base font-medium">
            A high-performance bot trading simulation environment. Seed your assets, deploy your fleet, and watch the market evolve in real-time.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            to="/live-exchange"
            className="group relative bg-card p-8 rounded-[2rem] border shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <TrendingUp size={120} />
            </div>

            <div className="relative z-10 space-y-6 text-left">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform duration-500">
                <TrendingUp size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight">Live Exchange</h3>
                <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                  Monitor live price action, visualize order depth, and track your bot fleet's performance.
                </p>
              </div>
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest pt-2">
                Enter Market <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>

          <Link
            to="/seeding-area"
            className="group relative bg-card p-8 rounded-[2rem] border shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Zap size={120} />
            </div>

            <div className="relative z-10 space-y-6 text-left">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform duration-500">
                <Zap size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight">Seeding Area</h3>
                <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                  Configure asset catalogs, initialize bot strategies, and reset the simulation environment.
                </p>
              </div>
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest pt-2">
                Configure Market <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        </div>

        {/* Test Button */}
        <div className="flex justify-center pt-8">
          <button
            onClick={() => updateRoleMutation.mutate()}
            disabled={updateRoleMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white font-bold rounded-full transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            {updateRoleMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Shield size={18} />
                Make Me Moderator
              </>
            )}
          </button>
        </div>

        {/* Footer info */}
        <div className="text-center pt-[1.6rem]">
          <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">
            Precision Engineering for Synthetic Markets
          </p>
        </div>
      </div>
    </div>
  )
}
