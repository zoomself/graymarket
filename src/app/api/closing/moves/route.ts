import { NextRequest, NextResponse } from "next/server";
import {
  computeClosingMoves,
  pickClosingCompareIterations,
  type SnapshotCapitalRow,
} from "@/lib/analytics/closing-move";
import {
  DEFAULT_CLOSING_THRESHOLDS,
  parseClosingThresholdsFromSearchParams,
} from "@/lib/analytics/closing-thresholds";
import { toDbDate } from "@/lib/dates";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { getSupabaseAnonClient } from "@/lib/supabase/server";
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

const SELECT_FIELDS =
  "stock_code, stock_name, dark_capital, open_capital, price_raw, change_ratio, dark_activity, rank_no";

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);
  const thresholds = parseClosingThresholdsFromSearchParams(
    request.nextUrl.searchParams,
  );

  try {
    const supabase = getSupabaseAnonClient();

    const { data: iterations, error } = await supabase
      .from("dark_trade_iterations")
      .select("id, iteration_no, completed_at")
      .eq("trade_date", formattedDate)
      .eq("status", "completed")
      .order("iteration_no", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!iterations || iterations.length < 2) {
      return NextResponse.json({
        baselineIterationNo: null,
        latestIterationNo: iterations?.at(-1)?.iteration_no ?? null,
        morningIterationNo: null,
        baselineTime: null,
        latestTime: iterations?.at(-1)?.completed_at ?? null,
        iterationCount: iterations?.length ?? 0,
        thresholds,
        rows: [],
        message: "需至少 2 轮 Worker 采样才能对比尾盘异动",
      });
    }

    const iterationMeta = iterations.map((item) => ({
      id: item.id as string,
      iterationNo: item.iteration_no as number,
      completedAt: (item.completed_at as string | null) ?? null,
    }));

    const picked = pickClosingCompareIterations(iterationMeta);

    if (!picked) {
      const hasAfternoon = iterationMeta.some((item) => {
        if (!item.completedAt) return false;
        const d = new Date(item.completedAt);
        const hour = Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Shanghai",
            hour: "numeric",
            hour12: false,
          }).format(d),
        );
        return hour >= 13;
      });

      return NextResponse.json({
        baselineIterationNo: null,
        latestIterationNo: iterationMeta.at(-1)?.iterationNo ?? null,
        morningIterationNo: null,
        baselineTime: null,
        latestTime: iterationMeta.at(-1)?.completedAt ?? null,
        iterationCount: iterations.length,
        thresholds,
        rows: [],
        message: hasAfternoon
          ? "下午采样中，需最新轮次晚于 13:00 基准轮次"
          : "等待下午 13:00 开盘后 Worker 采样，再开始实时比对",
      });
    }

    const loadSnapshots = (iterationId: string) =>
      fetchAllSnapshotsForIteration<DbSnapshotRow>(supabase, iterationId, SELECT_FIELDS);

    const [baselineRowsRaw, latestRowsRaw, morningRowsRaw] = await Promise.all([
      loadSnapshots(picked.baseline.id),
      loadSnapshots(picked.latest.id),
      picked.morning ? loadSnapshots(picked.morning.id) : Promise.resolve(null),
    ]);

    const baselineRows = baselineRowsRaw.map(mapSnapshotRow);
    const latestRows = latestRowsRaw.map(mapSnapshotRow);
    const morningRows = morningRowsRaw?.map(mapSnapshotRow) ?? null;

    const result = computeClosingMoves(
      baselineRows,
      latestRows,
      morningRows,
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

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
