-- Add sanity checks to prevent negative or zero pricing/quantities
ALTER TABLE orders
  ADD CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT orders_limit_price_positive CHECK (limit_price_cents > 0);

ALTER TABLE trades
  ADD CONSTRAINT trades_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT trades_execution_price_positive CHECK (execution_price_cents > 0);
