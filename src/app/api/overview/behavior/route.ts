import { NextRequest, NextResponse } from "next/server";
import { buildIntradayBehavior } from "@/lib/analytics/market-behavior";
import { toDbDate } from "@/lib/dates";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import { getSupabaseAnonClient } from "@/lib/supabase/server";
import { fetchAllSnapshotsForIteration } from "@/lib/supabase/snapshots";

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const apiDate = dateParam ?? getTodayTradeDateString();
  const formattedDate = toDbDate(apiDate);

  try {
    const supabase = getSupabaseAnonClient();
    type SnapshotRow = {
      stock_code: string;
      stock_name: string;
      price_raw: number;
      change_ratio: number;
    };

    const loadSnapshotsForIteration = (iterationId: string) =>
      fetchAllSnapshotsForIteration<SnapshotRow>(
        supabase,
        iterationId,
        "stock_code, stock_name, price_raw, change_ratio",
        { orderColumn: "stock_code", ascending: true },
      );

    const { data: iterations, error } = await supabase
      .from("dark_trade_iterations")
      .select("id, iteration_no")
      .eq("trade_date", formattedDate)
      .eq("status", "completed")
      .order("iteration_no", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!iterations || iterations.length < 2) {
      return NextResponse.json({ intraday: null, iterationCount: iterations?.length ?? 0 });
    }

    const firstId = iterations[0].id as string;
    const lastId = iterations[iterations.length - 1].id as string;

    const [firstRows, lastRows] = await Promise.all([
      loadSnapshotsForIteration(firstId),
      loadSnapshotsForIteration(lastId),
    ]);

    const firstByCode = new Map(firstRows.map((row) => [row.stock_code, row]));
    const pairs = lastRows
      .map((last) => {
        const first = firstByCode.get(last.stock_code);
        if (!first) return null;
        return {
          stockCode: last.stock_code as string,
          stockName: (last.stock_name as string) ?? last.stock_code,
          firstPriceRaw: Number(first.price_raw),
          lastPriceRaw: Number(last.price_raw),
          lastChangeRatio: Number(last.change_ratio),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const intraday = buildIntradayBehavior(pairs, iterations.length);

    return NextResponse.json({
      intraday,
      iterationCount: iterations.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
