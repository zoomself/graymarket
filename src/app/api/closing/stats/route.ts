import { NextRequest, NextResponse } from "next/server";
import { computeClosingContinuationStats } from "@/lib/analytics/closing-continuation-stats";
import { parseClosingThresholdsFromSearchParams } from "@/lib/analytics/closing-thresholds";
import { getTodayTradeDateString } from "@/lib/trading-hours";
import {
  buildClosingContinuationSamples,
  loadAvailableDates,
} from "@/lib/supabase/closing-continuation";
import { getSupabaseAnonClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const endDateParam = request.nextUrl.searchParams.get("endDate");
  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const thresholds = parseClosingThresholdsFromSearchParams(
    request.nextUrl.searchParams,
  );

  const endDate = endDateParam ?? getTodayTradeDateString();
  const days = Number.isFinite(daysParam)
    ? Math.min(60, Math.max(5, Math.floor(daysParam)))
    : 30;

  try {
    const supabase = getSupabaseAnonClient();
    const allDates = await loadAvailableDates(supabase);
    const eligible = allDates.filter((d) => d <= endDate);
    const selectedDates = eligible.slice(-days);

    if (selectedDates.length < 2) {
      return NextResponse.json(
        computeClosingContinuationStats(endDate, selectedDates.length, [], 0),
      );
    }

    const samples = await buildClosingContinuationSamples(
      supabase,
      selectedDates,
      thresholds,
    );

    const result = computeClosingContinuationStats(
      endDate,
      selectedDates.length,
      samples,
      selectedDates.length - 1,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
