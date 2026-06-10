import { NextRequest, NextResponse } from "next/server";
import { collapseDuplicateHistoryPoints } from "@/lib/queue/compare";
import { toDbDate } from "@/lib/dates";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { getSupabaseAnonClient } from "@/lib/supabase/server";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);

  try {
    const supabase = getSupabaseAnonClient();

    const { data: iterations, error: iterationError } = await supabase
      .from("dark_trade_iterations")
      .select("id, iteration_no")
      .eq("trade_date", formattedDate)
      .eq("status", "completed")
      .order("iteration_no", { ascending: true });

    if (iterationError) {
      return NextResponse.json(
        { error: iterationError.message },
        { status: 500, headers: CACHE_HEADERS },
      );
    }

    if (!iterations?.length) {
      return NextResponse.json(
        { stockCode: code, tradeDate: formattedDate, points: [] },
        { headers: CACHE_HEADERS },
      );
    }

    const iterationNoById = new Map(
      iterations.map((item) => [item.id as string, item.iteration_no as number]),
    );
    const iterationIds = iterations.map((item) => item.id as string);

    const { data, error } = await supabase
      .from("dark_trade_snapshots")
      .select("captured_at, dark_capital, open_capital, price_raw, iteration_id")
      .eq("trade_date", formattedDate)
      .eq("stock_code", code)
      .in("iteration_id", iterationIds)
      .order("captured_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: CACHE_HEADERS },
      );
    }

    const points = collapseDuplicateHistoryPoints(
      (data ?? []).map((row) => ({
        capturedAt: row.captured_at as string,
        iterationNo: iterationNoById.get(row.iteration_id as string) ?? 0,
        darkCapital: Number(row.dark_capital),
        openCapital: Number(row.open_capital),
        priceRaw: Number(row.price_raw),
      })),
    );

    return NextResponse.json(
      {
        stockCode: code,
        tradeDate: formattedDate,
        points,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
