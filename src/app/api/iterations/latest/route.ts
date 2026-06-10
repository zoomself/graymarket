import { NextRequest, NextResponse } from "next/server";
import { toApiDate, toDbDate } from "@/lib/dates";
import { getLiveDarkTradeCached } from "@/lib/eastmoney/live-cache";
import { parseTabKey } from "@/lib/eastmoney/tabs";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { getSupabaseAnonClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);
  const liveParam = request.nextUrl.searchParams.get("live");
  const preferLive = liveParam === "1" || liveParam === "true";
  const tab = parseTabKey(request.nextUrl.searchParams.get("tab"));
  const isStockTab = tab === "stock";

  try {
    let iteration = null;
    let snapshots: Array<Record<string, unknown>> = [];

    try {
      const supabase = getSupabaseAnonClient();

      const { data: dbIteration, error: iterationError } = await supabase
        .from("dark_trade_iterations")
        .select("*")
        .eq("trade_date", formattedDate)
        .eq("status", "completed")
        .order("iteration_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (iterationError) {
        console.warn("Supabase iteration query failed:", iterationError.message);
      } else if (dbIteration) {
        iteration = dbIteration;

        const { data: dbSnapshots, error: snapshotsError } = await supabase
          .from("dark_trade_snapshots")
          .select("*")
          .eq("iteration_id", dbIteration.id)
          .order("rank_no", { ascending: true });

        if (snapshotsError) {
          console.warn("Supabase snapshots query failed:", snapshotsError.message);
        } else {
          snapshots = dbSnapshots ?? [];
        }
      }
    } catch (error) {
      console.warn("Supabase unavailable:", error);
    }

    if ((!isStockTab || !iteration || snapshots.length === 0) || preferLive) {
      const live = await getLiveDarkTradeCached(toApiDate(formattedDate), tab);
      const capturedAt = new Date().toISOString();

      if (live.items.length === 0) {
        return NextResponse.json({
          source: "live",
          iteration: null,
          snapshots: [],
          message: "该日期无交易数据，请选择交易日",
        });
      }

      return NextResponse.json({
        source: "live",
        tab,
        complete: live.complete,
        iteration: {
          id: "live",
          tradeDate: formattedDate,
          iterationNo: 0,
          startedAt: capturedAt,
          completedAt: capturedAt,
          recordCount: live.items.length,
          totalCount: live.totalCount,
          status: "live",
        },
        snapshots: live.items.map((item, index) => ({
          id: index + 1,
          iterationId: "live",
          tradeDate: formattedDate,
          stockCode: item.stockCode,
          stockName: item.stockName,
          industry: item.industry,
          concept: item.concept,
          darkCapital: item.darkCapital,
          openCapital: item.openCapital,
          totalCapital: item.totalCapital,
          darkActivity: item.darkActivity,
          priceRaw: item.priceRaw,
          changeRatio: item.changeRatio,
          rankNo: item.rankNo || index + 1,
          capturedAt,
        })),
      });
    }

    return NextResponse.json({
      source: "database",
      tab: "stock",
      iteration: {
        id: iteration.id,
        tradeDate: iteration.trade_date,
        iterationNo: iteration.iteration_no,
        startedAt: iteration.started_at,
        completedAt: iteration.completed_at,
        recordCount: iteration.record_count,
        status: iteration.status,
      },
      snapshots: snapshots.map((row) => ({
        id: row.id,
        iterationId: row.iteration_id,
        tradeDate: row.trade_date,
        stockCode: row.stock_code,
        stockName: row.stock_name,
        industry: row.industry,
        concept: row.concept,
        darkCapital: row.dark_capital,
        openCapital: row.open_capital,
        totalCapital: row.total_capital,
        darkActivity: row.dark_activity,
        priceRaw: row.price_raw,
        changeRatio: row.change_ratio,
        rankNo: row.rank_no,
        capturedAt: row.captured_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
