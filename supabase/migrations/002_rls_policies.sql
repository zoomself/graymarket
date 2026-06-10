-- Allow anonymous read access for the web UI
ALTER TABLE dark_trade_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dark_trade_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read iterations" ON dark_trade_iterations;
CREATE POLICY "Public read iterations"
  ON dark_trade_iterations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read snapshots" ON dark_trade_snapshots;
CREATE POLICY "Public read snapshots"
  ON dark_trade_snapshots
  FOR SELECT
  USING (true);
