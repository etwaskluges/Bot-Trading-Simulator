import { createFileRoute, Link } from '@tanstack/react-router'
import { buttonVariants } from '~/lib/components/ui/button'
import { cn } from '~/lib/utils/cn'
import { UserAuthFormRegister } from './-components/user-auth-form'

const RegistgerPage = () => {
  return (
    <>
      <div className="container relative flex min-h-screen flex-col items-center justify-center px-6 py-10 md:hidden">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Create account</h1>
            <Link to="/auth/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Login
            </Link>
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Get started</h2>
            <p className="text-sm text-muted-foreground">
              Enter your email below to create your account.
            </p>
          </div>
          <UserAuthFormRegister />
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
      <div className="container relative flex-col items-center justify-center hidden h-screen md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
        <Link
          to="/auth/login"
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'absolute right-4 top-4 md:right-8 md:top-8',
          )}
        >
          Login
        </Link>
        <div className="relative flex-col hidden h-full p-10 text-white bg-muted dark:border-r lg:flex">
          <div className="absolute inset-0 bg-zinc-900" />
          <div className="relative z-20 flex items-center text-lg font-medium">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 mr-2"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
            Boilerplate
          </div>
          <div className="relative z-20 mt-auto">
            <blockquote className="space-y-2">
              <p className="text-lg">&ldquo;Let the games begin!&rdquo;</p>
              <footer className="text-sm">Bot No. 1</footer>
            </blockquote>
          </div>
        </div>
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Create Account</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email below to create your account.
              </p>
            </div>
            <UserAuthFormRegister />
            <p className="px-8 text-sm text-center text-muted-foreground">
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

export const Route = createFileRoute('/auth/register/')({
  component: RegistgerPage,
  loader: ({ context }) => {
    return { user: context.user }
  },
})
