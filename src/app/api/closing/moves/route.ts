import { NextRequest, NextResponse } from "next/server";
import { parseClosingThresholdsFromSearchParams } from "@/lib/analytics/closing-thresholds";
import { toDbDate } from "@/lib/dates";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { loadClosingMovesForTradeDate } from "@/lib/supabase/closing-day";
import { getSupabaseAnonClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);
  const thresholds = parseClosingThresholdsFromSearchParams(
    request.nextUrl.searchParams,
  );

  try {
    const supabase = getSupabaseAnonClient();
    const result = await loadClosingMovesForTradeDate(supabase, apiDate, thresholds);

    if (!result) {
      const { data: iterations } = await supabase
        .from("dark_trade_iterations")
        .select("iteration_no, completed_at")
        .eq("trade_date", formattedDate)
        .eq("status", "completed")
        .order("iteration_no", { ascending: true });

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

      return NextResponse.json({
        baselineIterationNo: null,
        latestIterationNo: iterations.at(-1)?.iteration_no ?? null,
        morningIterationNo: null,
        baselineTime: null,
        latestTime: iterations.at(-1)?.completed_at ?? null,
        iterationCount: iterations.length,
        thresholds,
        rows: [],
        message: "需下午 13:00 基准轮次及之后采样才能对比尾盘异动",
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
