import { NextRequest, NextResponse } from "next/server";
import {
  computeClosingFollowThrough,
  type TodaySnapshotRow,
} from "@/lib/analytics/closing-follow-through";
import {
  parseClosingThresholdsFromSearchParams,
} from "@/lib/analytics/closing-thresholds";
import {
  computeRotationReview,
  type RotationGroupBy,
  type StockDayRow,
} from "@/lib/analytics/sector-rotation";
import { toApiDate, toDbDate } from "@/lib/dates";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { loadClosingMovesForTradeDate } from "@/lib/supabase/closing-day";
import { getSupabaseAnonClient } from "@/lib/supabase/server";
import { fetchAllSnapshotsForIteration } from "@/lib/supabase/snapshots";

export const maxDuration = 120;

type DbSnapshotRow = {
  industry: string | null;
  concept: string | null;
  change_ratio: number;
  dark_capital: number;
};

type DbTodaySnapshotRow = {
  stock_code: string;
  stock_name: string;
  industry: string | null;
  concept: string | null;
  change_ratio: number;
  dark_capital: number;
};

function parseGroupBy(value: string | null): RotationGroupBy {
  return value === "concept" ? "concept" : "industry";
}

function mapRow(row: DbSnapshotRow): StockDayRow {
  return {
    industry: (row.industry as string) ?? "",
    concept: (row.concept as string) ?? "",
    changeRatio: Number(row.change_ratio),
    darkCapital: Number(row.dark_capital),
  };
}

function mapTodayRow(row: DbTodaySnapshotRow): TodaySnapshotRow {
  return {
    stockCode: row.stock_code,
    stockName: (row.stock_name as string) ?? row.stock_code,
    industry: (row.industry as string) ?? "",
    concept: (row.concept as string) ?? "",
    changeRatio: Number(row.change_ratio),
    darkCapital: Number(row.dark_capital),
  };
}

async function loadAvailableDates(): Promise<string[]> {
  const supabase = getSupabaseAnonClient();
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

async function loadLatestIterationId(tradeDate: string): Promise<string | null> {
  const supabase = getSupabaseAnonClient();
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

export async function GET(request: NextRequest) {
  const endDateParam = request.nextUrl.searchParams.get("endDate");
  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? 10);
  const groupBy = parseGroupBy(request.nextUrl.searchParams.get("groupBy"));
  const thresholds = parseClosingThresholdsFromSearchParams(
    request.nextUrl.searchParams,
  );

  const endDate = endDateParam ?? getTodayTradeDateString();
  const days = Number.isFinite(daysParam)
    ? Math.min(20, Math.max(2, Math.floor(daysParam)))
    : 10;

  try {
    const allDates = await loadAvailableDates();
    const eligible = allDates.filter((d) => d <= endDate);
    const selectedDates = eligible.slice(-days);

    if (selectedDates.length < 2) {
      return NextResponse.json(
        computeRotationReview(endDate, selectedDates, new Map(), groupBy),
      );
    }

    const snapshotsByDate = new Map<string, StockDayRow[]>();
    const supabase = getSupabaseAnonClient();

    const iterationIds = await Promise.all(
      selectedDates.map((date) => loadLatestIterationId(date)),
    );

    const snapshotLoads = selectedDates.map(async (date, index) => {
      const iterationId = iterationIds[index];
      if (!iterationId) return null;

      const rows = await fetchAllSnapshotsForIteration<DbSnapshotRow>(
        supabase,
        iterationId,
        "industry, concept, change_ratio, dark_capital",
      );
      return { date, rows: rows.map(mapRow) };
    });

    const loaded = await Promise.all(snapshotLoads);
    for (const item of loaded) {
      if (item) {
        snapshotsByDate.set(item.date, item.rows);
      }
    }

    const datesWithData = selectedDates.filter((d) => snapshotsByDate.has(d));
    const result = computeRotationReview(endDate, datesWithData, snapshotsByDate, groupBy);

    const prevDate = result.prevDate;
    const todayDate = result.latestDate;

    if (prevDate && todayDate) {
      const todayIterationId = await loadLatestIterationId(todayDate);

      const [closingResult, todayRowsRaw] = await Promise.all([
        loadClosingMovesForTradeDate(supabase, prevDate, thresholds),
        todayIterationId
          ? fetchAllSnapshotsForIteration<DbTodaySnapshotRow>(
              supabase,
              todayIterationId,
              "stock_code, stock_name, industry, concept, change_ratio, dark_capital",
            )
          : Promise.resolve([]),
      ]);

      result.closingFollowThrough = computeClosingFollowThrough(
        prevDate,
        todayDate,
        closingResult?.rows ?? [],
        todayRowsRaw.map(mapTodayRow),
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
