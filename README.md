# Bot Trading Simulator

A high-performance bot trading simulation environment. Seed your assets, deploy your fleet, and watch the market evolve in real-time.

## Local development

```bash
nvm use v20.18.0

# install dependencies
bun install

```

### Start Database

```bash
# run local supabase server
bun run dev:db

# copy the SUPABASE_ANON_KEY from the console into apps/web/.env and apps/bot-logic/.env

# open supabase dashboard at http://127.0.0.1:54323/project/default
```

## Generate types and schema

```bash
cd packages/db-drizzle

npx drizzle-kit introspect # for schema

npx drizzle-kit generate # for types

cd ../..
```

## Start Web

```bash
# run web app
bun run dev:web

# open web app at http://127.0.0.1:3000
# Start Seeding at http://127.0.0.1:3000/seeding-area before running the bots
```

## Start Bots

```bash
# run bots (after seeding)
bun run dev:bot
```

## Packages

- [tanstack/start](https://tanstack.com/start/latest)
- [shadcn/ui](https://ui.shadcn.com/docs/components)
- [lucide icons](https://lucide.dev)
- [sonner](https://sonner.emilkowal.ski/)
- [supabase](https://supabase.com)
