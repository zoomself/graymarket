ALTER TABLE dark_trade_iterations
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_iterations_content_hash
  ON dark_trade_iterations(trade_date, content_hash);
