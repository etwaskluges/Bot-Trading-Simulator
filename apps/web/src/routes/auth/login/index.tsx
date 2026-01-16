import { Link, createFileRoute } from '@tanstack/react-router'
import { buttonVariants } from '~/lib/components/ui/button'
import { cn } from '~/lib/utils/cn'
import { UserAuthFormLogin } from './-components/user-auth-form'

const LiveStockGlyph = () => {
  const sparkValues = [32, 60, 34, 68, 52, 76, 58]
  const maxValue = Math.max(...sparkValues)
  const points = sparkValues
    .map((value, index) => {
      const x = (index / (sparkValues.length - 1)) * 100
      const y = 100 - (value / maxValue) * 100
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="mt-6 relative w-full max-w-xs mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/10 p-4 shadow-[0_40px_80px_-40px_rgba(16,185,129,0.8)]">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/40 via-transparent to-emerald-500/10 opacity-60 animate-pulse pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.4em] text-white/70">
          <span>Live Stock</span>
          <span className="text-emerald-300">+4.2%</span>
        </div>
        <div className="relative z-10 mt-3 h-20 w-full">
          <svg className="h-full w-full mt-4" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="liveStockGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <polyline points="0,57.89473684210527 16.666666666666664,21.05263157894737 33.33333333333333,55.26315789473684 50,10.526315789473685 66.66666666666666,31.578947368421055 83.33333333333334,3 100,23.68421052631578" stroke="url(#liveStockGradient)" stroke-width="3" fill="none" class="animate-pulse"></polyline>
          </svg>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-400/50 via-transparent to-cyan-400/50" />
        </div>
        <p className="relative z-10 mt-3 text-[11px] text-white/80">
          Step 1: Test your trading theories. Step 3: Stonks.
        </p>
      </div>
    </div>
  )
}

const LoginPage = () => {
  return (
    <>
      <div className="container relative flex min-h-screen flex-col items-center justify-center px-6 py-10 md:hidden">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Login</h1>
            <Link
              to="/auth/register"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              Register
            </Link>
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Enter your email below to login to your workspace.
            </p>
          </div>
          <UserAuthFormLogin />
          <p className="px-4 text-center text-sm text-muted-foreground">
            By clicking continue, you agree to our{' '}
            <a
              href="/terms"
              className="underline underline-offset-4 hover:text-primary"
              target="_blank"
              rel="noreferrer"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              className="underline underline-offset-4 hover:text-primary"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
      <div className="container relative hidden h-screen flex-col items-center justify-center md:grid md:max-w-none md:grid-cols-2 md:px-0">
        <Link
          to="/auth/register"
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'absolute right-4 top-4 md:right-8 md:top-8',
          )}
        >
          Register
        </Link>
        <div className="relative hidden h-full flex-col overflow-hidden bg-muted p-10 text-white dark:border-r md:flex">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-950 to-cyan-950" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.35),transparent_55%)]" />
          <div className="relative z-20 flex items-center text-lg font-medium">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-6 w-6 text-emerald-300"
            >
              <path d="M3 12h4l3-7 4 14 3-7h4" />
            </svg>
            Bot Trading Simulator
          </div>
          <div className="relative z-20 mt-10 flex flex-1 items-center justify-center">
            <LiveStockGlyph />
          </div>
          <div className="relative z-20 mt-auto space-y-2 text-sm text-white/70">
            <p className="text-base font-semibold text-white">
              Trade ideas before the market opens.
            </p>
            <p>Simulate strategies, analyze outcomes, and refine your bots with confidence.</p>
          </div>
        </div>
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email below to login to your workspace.
              </p>
            </div>
            <UserAuthFormLogin />
            <p className="px-8 text-center text-sm text-muted-foreground">
              By clicking continue, you agree to our{' '}
              <a
                href="/terms"
                className="underline underline-offset-4 hover:text-primary"
                target="_blank"
                rel="noreferrer"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="/privacy"
                className="underline underline-offset-4 hover:text-primary"
                target="_blank"
                rel="noreferrer"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export const Route = createFileRoute('/auth/login/')({
  component: LoginPage,
  loader: ({ context }) => {
    return { user: context.user }
  },
})
