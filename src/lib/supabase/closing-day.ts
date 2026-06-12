import {
  computeClosingMoves,
  pickClosingCompareIterations,
  type ClosingMoveResult,
  type SnapshotCapitalRow,
} from "@/lib/analytics/closing-move";
import {
  DEFAULT_CLOSING_THRESHOLDS,
  type ClosingThresholds,
} from "@/lib/analytics/closing-thresholds";
import { toDbDate } from "@/lib/dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSnapshotsForIteration } from "@/lib/supabase/snapshots";

type DbSnapshotRow = {
  stock_code: string;
  stock_name: string;
  dark_capital: number;
  open_capital: number;
  price_raw: number;
  change_ratio: number;
  dark_activity: number;
  rank_no: number;
};

const SELECT_FIELDS =
  "stock_code, stock_name, dark_capital, open_capital, price_raw, change_ratio, dark_activity, rank_no";

function mapSnapshotRow(row: DbSnapshotRow): SnapshotCapitalRow {
  return {
    stockCode: row.stock_code,
    stockName: (row.stock_name as string) ?? row.stock_code,
    darkCapital: Number(row.dark_capital),
    openCapital: Number(row.open_capital),
    priceRaw: Number(row.price_raw),
    changeRatio: Number(row.change_ratio),
    darkActivity: Number(row.dark_activity),
    rankNo: Number(row.rank_no),
  };
}

export async function loadClosingMovesForTradeDate(
  supabase: SupabaseClient,
  tradeDate: string,
  thresholds: ClosingThresholds = DEFAULT_CLOSING_THRESHOLDS,
): Promise<ClosingMoveResult | null> {
  const { data: iterations, error } = await supabase
    .from("dark_trade_iterations")
    .select("id, iteration_no, completed_at")
    .eq("trade_date", toDbDate(tradeDate))
    .eq("status", "completed")
    .order("iteration_no", { ascending: true });

  if (error) throw new Error(error.message);
  if (!iterations || iterations.length < 2) return null;

  const iterationMeta = iterations.map((item) => ({
    id: item.id as string,
    iterationNo: item.iteration_no as number,
    completedAt: (item.completed_at as string | null) ?? null,
  }));

  const picked = pickClosingCompareIterations(iterationMeta);
  if (!picked) return null;

  const loadSnapshots = (iterationId: string) =>
    fetchAllSnapshotsForIteration<DbSnapshotRow>(supabase, iterationId, SELECT_FIELDS);

  const [baselineRowsRaw, latestRowsRaw, morningRowsRaw] = await Promise.all([
    loadSnapshots(picked.baseline.id),
    loadSnapshots(picked.latest.id),
    picked.morning ? loadSnapshots(picked.morning.id) : Promise.resolve(null),
  ]);

  return computeClosingMoves(
    baselineRowsRaw.map(mapSnapshotRow),
    latestRowsRaw.map(mapSnapshotRow),
    morningRowsRaw?.map(mapSnapshotRow) ?? null,
    {
      baselineIterationNo: picked.baseline.iterationNo,
      latestIterationNo: picked.latest.iterationNo,
      morningIterationNo: picked.morning?.iterationNo ?? null,
      baselineTime: picked.baseline.completedAt,
      latestTime: picked.latest.completedAt,
      iterationCount: iterations.length,
    },
    thresholds,
  );
}
