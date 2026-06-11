import { NextResponse } from "next/server";
import { toApiDate } from "@/lib/dates";
import { getSupabaseAnonClient } from "@/lib/supabase/server";

/** Dates that have persisted Worker data in Supabase. */
export async function GET() {
  try {
    const supabase = getSupabaseAnonClient();
    const { data, error } = await supabase
      .from("dark_trade_iterations")
      .select("trade_date")
      .eq("status", "completed")
      .order("trade_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dateSet = new Set<string>();
    for (const row of data ?? []) {
      dateSet.add(toApiDate(String(row.trade_date)));
    }

    const dates = [...dateSet].sort((a, b) => b.localeCompare(a));

    return NextResponse.json({ dates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
