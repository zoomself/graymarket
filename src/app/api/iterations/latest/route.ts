import { NextRequest, NextResponse } from "next/server";
import { toApiDate, toDbDate } from "@/lib/dates";
import { getLiveDarkTradeCached } from "@/lib/eastmoney/live-cache";
import { dedupeSnapshotsByStockCode, isStockLikeTab, parseTabKey } from "@/lib/eastmoney/tabs";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { getSupabaseAnonClient } from "@/lib/supabase/server";
import { fetchAllSnapshotsForIteration } from "@/lib/supabase/snapshots";

export const maxDuration = 120;

function emptyDateResponse(formattedDate: string, message?: string) {
  return NextResponse.json({
    source: "none",
    iteration: null,
    snapshots: [],
    requestedDate: formattedDate,
    message: message ?? `${formattedDate} 暂无暗盘数据，请选择有数据的交易日`,
  });
}

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);
  const liveParam = request.nextUrl.searchParams.get("live");
  const preferLive = liveParam === "1" || liveParam === "true";
  const tab = parseTabKey(request.nextUrl.searchParams.get("tab"));
  const isStockLike = isStockLikeTab(tab);

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

        try {
          const dbSnapshots = await fetchAllSnapshotsForIteration<Record<string, unknown>>(
            supabase,
            dbIteration.id as string,
            "*",
          );
          snapshots = dbSnapshots;
        } catch (snapshotsError) {
          console.warn(
            "Supabase snapshots query failed:",
            snapshotsError instanceof Error ? snapshotsError.message : snapshotsError,
          );
        }
      }
    } catch (error) {
      console.warn("Supabase unavailable:", error);
    }

    if ((!isStockLike || !iteration || snapshots.length === 0) || preferLive) {
      const requestedApiDate = toApiDate(formattedDate);
      const today = getTodayTradeDateString();

      if (!preferLive && requestedApiDate !== today) {
        return emptyDateResponse(formattedDate);
      }

      const live = await getLiveDarkTradeCached(requestedApiDate, tab);
      const capturedAt = new Date().toISOString();

      if (live.items.length === 0) {
        return emptyDateResponse(formattedDate);
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
        snapshots: dedupeSnapshotsByStockCode(
          live.items.map((item, index) => ({
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
        ),
      });
    }

    return NextResponse.json({
      source: "database",
      tab: tab === "overview" ? "overview" : tab,
      iteration: {
        id: iteration.id,
        tradeDate: iteration.trade_date,
        iterationNo: iteration.iteration_no,
        startedAt: iteration.started_at,
        completedAt: iteration.completed_at,
        recordCount: iteration.record_count,
        status: iteration.status,
      },
      snapshots: dedupeSnapshotsByStockCode(
        snapshots.map((row) => ({
          id: row.id,
          iterationId: row.iteration_id,
          tradeDate: row.trade_date,
          stockCode: row.stock_code as string,
          stockName: row.stock_name,
          industry: row.industry,
          concept: row.concept,
          darkCapital: row.dark_capital,
          openCapital: row.open_capital,
          totalCapital: row.total_capital,
          darkActivity: row.dark_activity,
          priceRaw: row.price_raw,
          changeRatio: row.change_ratio,
          rankNo: row.rank_no as number,
          capturedAt: row.captured_at,
        })),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
