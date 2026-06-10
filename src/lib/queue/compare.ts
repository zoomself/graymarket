import { createHash } from "crypto";
import type { DarkTradeSnapshot } from "@/lib/eastmoney/types";

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

function normalizeInt(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? String(Math.trunc(n)) : "0";
}

function normalizeDecimal(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(6) : "0.000000";
}

export function buildSnapshotsFingerprint(
  items: ComparableSnapshot[],
): string {
  const normalized = [...items]
    .sort((a, b) => a.stockCode.localeCompare(b.stockCode))
    .map(
      (item) =>
        [
          item.stockCode,
          normalizeInt(item.darkCapital),
          normalizeInt(item.openCapital),
          normalizeInt(item.totalCapital),
          normalizeDecimal(item.darkActivity),
          normalizeDecimal(item.priceRaw),
          normalizeDecimal(item.changeRatio),
        ].join("|"),
    )
    .join("\n");

  return createHash("sha256").update(normalized).digest("hex");
}

export function areSnapshotsEqual(
  a: ComparableSnapshot[],
  b: ComparableSnapshot[],
): boolean {
  if (a.length !== b.length) return false;
  return buildSnapshotsFingerprint(a) === buildSnapshotsFingerprint(b);
}

function historyPointKey(point: {
  darkCapital: number;
  openCapital: number;
  priceRaw: number;
}): string {
  return [
    normalizeInt(point.darkCapital),
    normalizeInt(point.openCapital),
    normalizeInt(point.priceRaw),
  ].join("|");
}

export function collapseDuplicateHistoryPoints<
  T extends {
    darkCapital: number;
    openCapital: number;
    priceRaw: number;
  },
>(points: T[]): T[] {
  if (points.length <= 1) return points;

  return points.filter((point, index) => {
    if (index === 0) return true;
    return historyPointKey(points[index - 1]) !== historyPointKey(point);
  });
}
