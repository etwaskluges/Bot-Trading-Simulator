-- apps/supabase/migrations/20250329160000_matching_engine.sql

-- 1. TRIGGER: Reserve Funds/Shares on Order Placement (BEFORE INSERT)
-- This ensures 'Ghost Liquidity' is impossible. You cannot place an order without the assets.
CREATE OR REPLACE FUNCTION process_order_placement() RETURNS TRIGGER AS $$
DECLARE
    user_balance BIGINT;
    user_shares INTEGER;
    cost_basis BIGINT;
BEGIN
    IF NEW.type = 'BUY' THEN
        -- Calculate max cost (Limit Price * Quantity)
        cost_basis := NEW.limit_price_cents * NEW.quantity;
        
        -- Lock Trader Row for Balance Check & Update
        SELECT balance_cents INTO user_balance 
        FROM traders WHERE id = NEW.trader_id FOR UPDATE;

        IF user_balance < cost_basis THEN
            RAISE EXCEPTION 'Insufficient funds: Required % cents, Available % cents', cost_basis, user_balance;
        END IF;

        -- Deduct Cost Immediately
        UPDATE traders 
        SET balance_cents = balance_cents - cost_basis 
        WHERE id = NEW.trader_id;
        
    ELSIF NEW.type = 'SELL' THEN
        -- Lock Portfolio Row for Share Check & Update
        SELECT shares_owned INTO user_shares 
        FROM portfolios 
        WHERE trader_id = NEW.trader_id AND stock_id = NEW.stock_id FOR UPDATE;

        IF user_shares IS NULL OR user_shares < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient shares: Required %, Available %', NEW.quantity, COALESCE(user_shares, 0);
        END IF;

        -- Deduct Shares Immediately
        UPDATE portfolios 
        SET shares_owned = shares_owned - NEW.quantity 
        WHERE trader_id = NEW.trader_id AND stock_id = NEW.stock_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_order_placement ON orders;
CREATE TRIGGER trigger_process_order_placement
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION process_order_placement();


-- 2. TRIGGER: Refund Assets on Order Cancellation (AFTER UPDATE)
-- If an order is cancelled (by user or system), return the unused reserved assets.
CREATE OR REPLACE FUNCTION process_order_cancellation() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'OPEN' AND NEW.status = 'CANCELLED' THEN
        -- Only refund the REMAINING quantity
        IF NEW.type = 'BUY' THEN
            -- Return Funds: Remaining Qty * Limit Price
            UPDATE traders 
            SET balance_cents = balance_cents + (NEW.quantity * NEW.limit_price_cents)
            WHERE id = NEW.trader_id;
            
        ELSIF NEW.type = 'SELL' THEN
            -- Return Shares: Remaining Qty
            INSERT INTO portfolios (trader_id, stock_id, shares_owned)
            VALUES (NEW.trader_id, NEW.stock_id, NEW.quantity)
            ON CONFLICT (trader_id, stock_id) 
            DO UPDATE SET shares_owned = portfolios.shares_owned + EXCLUDED.shares_owned;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_order_cancellation ON orders;
CREATE TRIGGER trigger_process_order_cancellation
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION process_order_cancellation();


-- 3. FUNCTION: Matching Engine (AFTER INSERT)
-- Matches orders using the already-reserved assets.
CREATE OR REPLACE FUNCTION match_orders() RETURNS TRIGGER AS $$
DECLARE
    match_record RECORD;
    trade_qty INTEGER;
    trade_price BIGINT;
    remaining_qty INTEGER;
    buyer_uuid UUID;
    seller_uuid UUID;
    buyer_limit_price BIGINT;
BEGIN
    -- We work with NEW.quantity (which is effectively remaining_qty since it's a new insert)
    -- Note: Trigger runs AFTER INSERT, so the row exists.
    remaining_qty := NEW.quantity;

    -- LOOP: Find matching orders in the OPPOSITE direction
    FOR match_record IN
        SELECT * FROM orders
        WHERE stock_id = NEW.stock_id
          AND status = 'OPEN'
          AND id != NEW.id
          AND trader_id != NEW.trader_id -- Self-trade prevention (simple)
          AND type = (CASE WHEN NEW.type = 'BUY' THEN 'SELL' ELSE 'BUY' END)
          AND (
            (NEW.type = 'BUY' AND limit_price_cents <= NEW.limit_price_cents) OR
            (NEW.type = 'SELL' AND limit_price_cents >= NEW.limit_price_cents)
          )
        ORDER BY
            CASE WHEN NEW.type = 'BUY' THEN limit_price_cents END ASC, -- Buyers want lowest sell price
            CASE WHEN NEW.type = 'SELL' THEN limit_price_cents END DESC, -- Sellers want highest buy price
            created_at ASC
        FOR UPDATE -- Lock match_record (MAKER)
    LOOP
        -- Determine Buyer/Seller
        IF NEW.type = 'BUY' THEN
            buyer_uuid := NEW.trader_id;
            seller_uuid := match_record.trader_id;
            buyer_limit_price := NEW.limit_price_cents;
        ELSE
            buyer_uuid := match_record.trader_id;
            seller_uuid := NEW.trader_id;
            buyer_limit_price := match_record.limit_price_cents;
        END IF;

        -- 1. Determine Trade details
        trade_qty := LEAST(remaining_qty, match_record.quantity);
        trade_price := match_record.limit_price_cents; -- Maker sets the price

        -- 2. RECORD THE TRADE
        INSERT INTO trades (stock_id, buyer_id, seller_id, execution_price_cents, quantity)
        VALUES (NEW.stock_id, buyer_uuid, seller_uuid, trade_price, trade_qty);

        -- 3. UPDATE STOCK PRICE
        UPDATE stocks SET current_price_cents = trade_price WHERE id = NEW.stock_id;

        -- 4. SETTLEMENT (Assets are already reserved!)
        
        -- Seller: Gets Cash (Quantity * ExecutionPrice)
        UPDATE traders 
        SET balance_cents = balance_cents + (trade_qty * trade_price) 
        WHERE id = seller_uuid;

        -- Buyer: Gets Shares
        INSERT INTO portfolios (trader_id, stock_id, shares_owned)
        VALUES (buyer_uuid, NEW.stock_id, trade_qty)
        ON CONFLICT (trader_id, stock_id) 
        DO UPDATE SET shares_owned = portfolios.shares_owned + EXCLUDED.shares_owned;

        -- Buyer Refund: If executed price < buyer's reserved limit price
        IF trade_price < buyer_limit_price THEN
            UPDATE traders 
            SET balance_cents = balance_cents + (trade_qty * (buyer_limit_price - trade_price))
            WHERE id = buyer_uuid;
        END IF;

        -- 5. UPDATE MAKER ORDER
        UPDATE orders SET
            quantity = quantity - trade_qty,
            status = CASE WHEN quantity - trade_qty = 0 THEN 'FILLED' ELSE 'OPEN' END
        WHERE id = match_record.id;

        -- 6. DECREMENT TAKER REMAINING
        remaining_qty := remaining_qty - trade_qty;

        IF remaining_qty = 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- 7. UPDATE TAKER ORDER
    -- Even if partially filled, we update the record.
    -- If fully filled (remaining=0), status='FILLED'
    -- If partially filled, status remains 'OPEN' (and the rest waits on the book)
    UPDATE orders SET
        quantity = remaining_qty,
        status = CASE WHEN remaining_qty = 0 THEN 'FILLED' ELSE 'OPEN' END
    WHERE id = NEW.id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER DEFINITION
DROP TRIGGER IF EXISTS trigger_match_orders ON orders;
CREATE TRIGGER trigger_match_orders
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION match_orders();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_trader_status ON orders(trader_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_stock_status ON orders(stock_id, status, type, limit_price_cents);

-- 4. VIEW: Last Minute Average Price (per stock)
-- Used by bot strategies as the lastMinuteAverage fact.
CREATE OR REPLACE VIEW last_minute_average_prices AS
SELECT
    stock_id,
    round(avg(execution_price_cents))::bigint AS average_price_cents
FROM trades
WHERE executed_at >= now() - interval '1 minute'
GROUP BY stock_id;