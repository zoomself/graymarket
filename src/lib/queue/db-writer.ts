import type { DarkTradeSnapshot, QueuePayload } from "@/lib/eastmoney/types";
import { buildSnapshotsFingerprint } from "@/lib/queue/compare";
import { toDbDate } from "@/lib/dates";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const BATCH_SIZE = 500;

function toDbRow(
  iterationId: string,
  tradeDate: string,
  capturedAt: string,
  item: DarkTradeSnapshot,
) {
  return {
    iteration_id: iterationId,
    trade_date: tradeDate,
    stock_code: item.stockCode,
    stock_name: item.stockName,
    industry: item.industry,
    concept: item.concept,
    dark_capital: item.darkCapital,
    open_capital: item.openCapital,
    total_capital: item.totalCapital,
    dark_activity: item.darkActivity,
    price_raw: item.priceRaw,
    change_ratio: item.changeRatio,
    rank_no: item.rankNo,
    captured_at: capturedAt,
  };
}

export async function persistQueuePayload(payload: QueuePayload): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const dbTradeDate = toDbDate(payload.tradeDate);
  const contentHash = buildSnapshotsFingerprint(payload.items);

  const { data: iteration, error: iterationError } = await supabase
    .from("dark_trade_iterations")
    .insert({
      trade_date: dbTradeDate,
      iteration_no: payload.iterationNo,
      started_at: payload.capturedAt,
      record_count: payload.items.length,
      status: "running",
    })
    .select("id")
    .single();

  if (iterationError || !iteration) {
    throw new Error(`Failed to create iteration: ${iterationError?.message}`);
  }

  const iterationId = iteration.id as string;

  for (let i = 0; i < payload.items.length; i += BATCH_SIZE) {
    const batch = payload.items.slice(i, i + BATCH_SIZE);
    const rows = batch.map((item) =>
      toDbRow(iterationId, dbTradeDate, payload.capturedAt, item),
    );

    const { error } = await supabase.from("dark_trade_snapshots").insert(rows);
    if (error) {
      await supabase
        .from("dark_trade_iterations")
        .update({ status: "failed" })
        .eq("id", iterationId);
      throw new Error(`Failed to insert snapshots: ${error.message}`);
    }
  }

  const completedAt = new Date().toISOString();
  const completedUpdate = {
    status: "completed" as const,
    completed_at: completedAt,
    record_count: payload.items.length,
  };

  const { error: updateError } = await supabase
    .from("dark_trade_iterations")
    .update({ ...completedUpdate, content_hash: contentHash })
    .eq("id", iterationId);

  if (updateError?.message.includes("content_hash")) {
    const { error: fallbackError } = await supabase
      .from("dark_trade_iterations")
      .update(completedUpdate)
      .eq("id", iterationId);

    if (fallbackError) {
      throw new Error(`Failed to update iteration: ${fallbackError.message}`);
    }
  } else if (updateError) {
    throw new Error(`Failed to update iteration: ${updateError.message}`);
  }

  return iterationId;
}

function mapRowToComparable(row: {
  stock_code: string;
  dark_capital: number;
  open_capital: number;
  total_capital: number;
  dark_activity: number;
  price_raw: number;
  change_ratio: number;
}): ComparableSnapshot {
  return {
    stockCode: row.stock_code,
    darkCapital: Number(row.dark_capital),
    openCapital: Number(row.open_capital),
    totalCapital: Number(row.total_capital),
    darkActivity: Number(row.dark_activity),
    priceRaw: Number(row.price_raw),
    changeRatio: Number(row.change_ratio),
  };
}

type ComparableSnapshot = Pick<
  DarkTradeSnapshot,
  | "stockCode"
  | "darkCapital"
  | "openCapital"
  | "totalCapital"
  | "darkActivity"
  | "priceRaw"
  | "changeRatio"
>;

export async function getLatestCompletedContentHash(
  tradeDate: string,
): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  const dbTradeDate = toDbDate(tradeDate);

  const { data: iteration, error: iterationError } = await supabase
    .from("dark_trade_iterations")
    .select("id")
    .eq("trade_date", dbTradeDate)
    .eq("status", "completed")
    .order("iteration_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (iterationError || !iteration) {
    return null;
  }

  const { data: hashRow, error: hashError } = await supabase
    .from("dark_trade_iterations")
    .select("content_hash")
    .eq("id", iteration.id)
    .maybeSingle();

  if (!hashError && hashRow?.content_hash) {
    return hashRow.content_hash as string;
  }

  // Fallback when content_hash column is missing or not yet backfilled.
  const items: ComparableSnapshot[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("dark_trade_snapshots")
      .select(
        "stock_code, dark_capital, open_capital, total_capital, dark_activity, price_raw, change_ratio",
      )
      .eq("iteration_id", iteration.id)
      .order("stock_code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load previous snapshots: ${error.message}`);
    }

    if (!data?.length) break;

    items.push(...data.map(mapRowToComparable));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (items.length === 0) return null;
  return buildSnapshotsFingerprint(items);
}

export async function isDuplicatePayload(
  payload: QueuePayload,
): Promise<boolean> {
  const previousHash = await getLatestCompletedContentHash(payload.tradeDate);
  if (!previousHash) return false;
  return buildSnapshotsFingerprint(payload.items) === previousHash;
}

export async function getNextIterationNo(tradeDate: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const dbTradeDate = toDbDate(tradeDate);
  const { data, error } = await supabase
    .from("dark_trade_iterations")
    .select("iteration_no")
    .eq("trade_date", dbTradeDate)
    .order("iteration_no", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to query iteration count: ${error.message}`);
  }

  return (data?.[0]?.iteration_no ?? 0) + 1;
}
