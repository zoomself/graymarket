import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_PAGE_SIZE = 1000;

export async function fetchAllSnapshotsForIteration<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  iterationId: string,
  select: string,
  options?: {
    orderColumn?: string;
    ascending?: boolean;
  },
): Promise<T[]> {
  const orderColumn = options?.orderColumn ?? "rank_no";
  const ascending = options?.ascending ?? true;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("dark_trade_snapshots")
      .select(select)
      .eq("iteration_id", iterationId)
      .order(orderColumn, { ascending })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) break;

    rows.push(...(data as unknown as T[]));

    if (data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}
