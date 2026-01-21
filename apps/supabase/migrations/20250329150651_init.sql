-- apps/supabase/migrations/20250329150651_init.sql

-- 1. STOCKS
CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    current_price_cents BIGINT NOT NULL DEFAULT 0,
    total_shares INTEGER NOT NULL DEFAULT 0
);

-- 2. Strategies
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rules JSONB NOT NULL
);

-- 2. TRADERS
CREATE TABLE traders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_bot BOOLEAN NOT NULL DEFAULT false,
    balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    strategy TEXT,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 3. PORTFOLIOS
CREATE TABLE portfolios (
    trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    shares_owned INTEGER NOT NULL DEFAULT 0 CHECK (shares_owned >= 0),
    PRIMARY KEY (trader_id, stock_id)
);

-- 4. ORDERS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
    limit_price_cents BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'FILLED', 'CANCELLED')) DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. TRADES (History)
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES traders(id),
    seller_id UUID NOT NULL REFERENCES traders(id),
    execution_price_cents BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. PRIVILEGES
CREATE TABLE privileges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_role TEXT NOT NULL DEFAULT 'user',
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
);