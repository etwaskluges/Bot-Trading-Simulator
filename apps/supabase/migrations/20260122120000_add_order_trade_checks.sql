-- Add sanity checks to prevent negative or zero pricing/quantities
-- Allow filled/cancelled orders to reach zero quantity while keeping OPEN > 0
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_quantity_positive;

ALTER TABLE orders
  ADD CONSTRAINT orders_quantity_positive
  CHECK (quantity >= 0 AND (status <> 'OPEN' OR quantity > 0)),
  ADD CONSTRAINT orders_limit_price_positive CHECK (limit_price_cents > 0);

ALTER TABLE trades
  ADD CONSTRAINT trades_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT trades_execution_price_positive CHECK (execution_price_cents > 0);
