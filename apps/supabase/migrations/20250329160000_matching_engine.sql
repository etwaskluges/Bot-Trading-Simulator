-- apps/supabase/migrations/20250329160000_matching_engine.sql

-- Function to handle order matching, trade execution, and balance updates
CREATE OR REPLACE FUNCTION match_orders() RETURNS TRIGGER AS $$
DECLARE
    match_record RECORD;
    trade_qty INTEGER;
    trade_price BIGINT;
    remaining_qty INTEGER;
    buyer_uuid UUID;
    seller_uuid UUID;
    buyer_balance BIGINT;
    seller_shares INTEGER;
BEGIN
    remaining_qty := NEW.quantity;

    -- LOOP: Find matching orders in the OPPOSITE direction
    FOR match_record IN
        SELECT * FROM orders
        WHERE stock_id = NEW.stock_id
          AND status = 'OPEN'
          AND trader_id != NEW.trader_id
          AND type = (CASE WHEN NEW.type = 'BUY' THEN 'SELL' ELSE 'BUY' END)
          AND (
            (NEW.type = 'BUY' AND limit_price_cents <= NEW.limit_price_cents) OR
            (NEW.type = 'SELL' AND limit_price_cents >= NEW.limit_price_cents)
          )
        ORDER BY
            CASE WHEN NEW.type = 'BUY' THEN limit_price_cents END ASC,
            CASE WHEN NEW.type = 'SELL' THEN limit_price_cents END DESC,
            created_at ASC
        FOR UPDATE
    LOOP
        -- Identify Buyer and Seller for this potential match
        IF NEW.type = 'BUY' THEN
            buyer_uuid := NEW.trader_id;
            seller_uuid := match_record.trader_id;
        ELSE
            buyer_uuid := match_record.trader_id;
            seller_uuid := NEW.trader_id;
        END IF;

        -- 1. Determine Initial Trade Quantity (Min of both orders)
        trade_qty := LEAST(remaining_qty, match_record.quantity);
        
        -- 2. Determine Trade Price (Maker's price)
        trade_price := match_record.limit_price_cents;

        -- 3. ENSURE SOLVENCY AND ASSET AVAILABILITY
        -- Check Buyer Balance
        SELECT balance_cents INTO buyer_balance FROM traders WHERE id = buyer_uuid;
        -- Check Seller Shares
        SELECT COALESCE(shares_owned, 0) INTO seller_shares FROM portfolios 
        WHERE trader_id = seller_uuid AND stock_id = NEW.stock_id;

        -- Cap trade_qty by Buyer's balance
        IF trade_price > 0 THEN
            trade_qty := LEAST(trade_qty, (buyer_balance / trade_price)::INTEGER);
        END IF;

        -- Cap trade_qty by Seller's available shares
        trade_qty := LEAST(trade_qty, seller_shares);

        -- If no trade is possible, handle the blocked order and continue
        IF trade_qty <= 0 THEN
            -- If the MAKER order is the one that's unfulfillable, mark it as cancelled
            -- to prevent it from blocking the book.
            IF (NEW.type = 'BUY' AND seller_shares <= 0) OR (NEW.type = 'SELL' AND buyer_balance < trade_price) THEN
                UPDATE orders SET status = 'CANCELLED' WHERE id = match_record.id;
            END IF;
            
            -- If the NEW order is the one that's unfulfillable (e.g. buyer is broke), we stop matching
            IF (NEW.type = 'BUY' AND buyer_balance < trade_price) OR (NEW.type = 'SELL' AND seller_shares <= 0) THEN
                EXIT;
            END IF;

            CONTINUE;
        END IF;

        -- 4. RECORD THE TRADE
        INSERT INTO trades (stock_id, buyer_id, seller_id, execution_price_cents, quantity)
        VALUES (NEW.stock_id, buyer_uuid, seller_uuid, trade_price, trade_qty);

        -- 5. UPDATE STOCK PRICE
        UPDATE stocks SET current_price_cents = trade_price WHERE id = NEW.stock_id;

        -- 6. UPDATE TRADER BALANCES
        UPDATE traders SET balance_cents = balance_cents - (trade_price * trade_qty) WHERE id = buyer_uuid;
        UPDATE traders SET balance_cents = balance_cents + (trade_price * trade_qty) WHERE id = seller_uuid;

        -- 7. UPDATE PORTFOLIOS
        -- Buyer Gets Shares
        INSERT INTO portfolios (trader_id, stock_id, shares_owned)
        VALUES (buyer_uuid, NEW.stock_id, trade_qty)
        ON CONFLICT (trader_id, stock_id) 
        DO UPDATE SET shares_owned = portfolios.shares_owned + EXCLUDED.shares_owned;

        -- Seller Loses Shares (Using a more robust update that won't fail if checking was skipped)
        UPDATE portfolios SET shares_owned = shares_owned - trade_qty
        WHERE trader_id = seller_uuid AND stock_id = NEW.stock_id;

        -- 8. UPDATE THE MATCHED (MAKER) ORDER
        UPDATE orders SET
            quantity = quantity - trade_qty,
            status = CASE WHEN quantity - trade_qty = 0 THEN 'FILLED' ELSE 'OPEN' END
        WHERE id = match_record.id;

        -- 9. DECREMENT REMAINING QTY ON NEW (TAKER) ORDER
        remaining_qty := remaining_qty - trade_qty;

        IF remaining_qty = 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- 10. UPDATE THE NEW (TAKER) ORDER STATUS
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
 
-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_orders_trader_status ON orders(trader_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_stock_status ON orders(stock_id, status, type, limit_price_cents);