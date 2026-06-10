-- Dark trade iteration metadata
CREATE TABLE IF NOT EXISTS dark_trade_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date DATE NOT NULL,
  iteration_no INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  record_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  UNIQUE (trade_date, iteration_no)
);

-- Per-stock snapshots for each iteration
CREATE TABLE IF NOT EXISTS dark_trade_snapshots (
  id BIGSERIAL PRIMARY KEY,
  iteration_id UUID NOT NULL REFERENCES dark_trade_iterations(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  stock_code VARCHAR(10) NOT NULL,
  stock_name TEXT,
  industry TEXT,
  concept TEXT,
  dark_capital BIGINT,
  open_capital BIGINT,
  total_capital BIGINT,
  dark_activity NUMERIC,
  price_raw NUMERIC,
  change_ratio NUMERIC,
  rank_no INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_iteration ON dark_trade_snapshots(iteration_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_code_date ON dark_trade_snapshots(trade_date, stock_code, captured_at);
CREATE INDEX IF NOT EXISTS idx_iterations_date ON dark_trade_iterations(trade_date, iteration_no DESC);
