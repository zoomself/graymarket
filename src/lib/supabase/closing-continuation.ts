import type { ContinuationSample } from "@/lib/analytics/closing-continuation-stats";
import type { ClosingThresholds } from "@/lib/analytics/closing-thresholds";
import { toApiDate, toDbDate } from "@/lib/dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClosingMovesForTradeDate } from "@/lib/supabase/closing-day";
import { fetchAllSnapshotsForIteration } from "@/lib/supabase/snapshots";

type NextDayRow = {
  stock_code: string;
  change_ratio: number;
};

async function loadLatestIterationId(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("dark_trade_iterations")
    .select("id")
    .eq("trade_date", toDbDate(tradeDate))
    .eq("status", "completed")
    .order("iteration_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

export async function loadAvailableDates(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("dark_trade_iterations")
    .select("trade_date")
    .eq("status", "completed")
    .order("trade_date", { ascending: false });

  if (error) throw new Error(error.message);

  const dateSet = new Set<string>();
  for (const row of data ?? []) {
    dateSet.add(toApiDate(String(row.trade_date)));
  }
  return [...dateSet].sort((a, b) => a.localeCompare(b));
}

export async function buildClosingContinuationSamples(
  supabase: SupabaseClient,
  dates: string[],
  thresholds: ClosingThresholds,
): Promise<ContinuationSample[]> {
  if (dates.length < 2) return [];

  const samples: ContinuationSample[] = [];

  for (let i = 0; i < dates.length - 1; i += 1) {
    const prevDate = dates[i];
    const nextDate = dates[i + 1];

    const closing = await loadClosingMovesForTradeDate(supabase, prevDate, thresholds);
    if (!closing?.rows.length) continue;

    const nextIterationId = await loadLatestIterationId(supabase, nextDate);
    if (!nextIterationId) continue;

    const nextRows = await fetchAllSnapshotsForIteration<NextDayRow>(
      supabase,
      nextIterationId,
      "stock_code, change_ratio",
    );
    const nextByCode = new Map(
      nextRows.map((row) => [row.stock_code, Number(row.change_ratio)]),
    );

    for (const row of closing.rows) {
      const nextChange = nextByCode.get(row.stockCode);
      if (nextChange === undefined) continue;

      samples.push({
        prevDate,
        nextDate,
        stockCode: row.stockCode,
        signalType: row.signalType,
        prevChange: row.changeRatio,
        nextChange,
        darkDelta: row.darkDelta,
      });
    }
  }

  return samples;
}
