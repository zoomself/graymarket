import type { ClosingMoveRow } from "@/lib/analytics/closing-move";
import type { ClosingThresholds } from "@/lib/analytics/closing-thresholds";
import { closingThresholdsToQuery } from "@/lib/analytics/closing-thresholds";
import type {
  RotationGroupBy,
  RotationReviewResult,
} from "@/lib/analytics/sector-rotation";
import type { TableSnapshot } from "@/components/DarkTradeTable";
import { isStockLikeTab, type TabKey } from "@/lib/eastmoney/tabs";

function todayYyyymmdd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

interface IterationInfo {
  id: string;
  tradeDate: string;
  iterationNo: number;
  completedAt: string | null;
  recordCount: number;
  totalCount?: number;
  status?: string;
}

export interface LatestTabBundle {
  rows: TableSnapshot[];
  iteration: IterationInfo | null;
  dataSource: "database" | "live" | "none";
  liveComplete: boolean;
  listMessage: string | null;
  fetchedAt: number;
}

export interface ClosingTabBundle {
  rows: ClosingMoveRow[];
  meta: {
    baselineIterationNo: number | null;
    latestIterationNo: number | null;
    morningIterationNo: number | null;
    baselineTime: string | null;
    latestTime: string | null;
    iterationCount: number;
    message?: string | null;
  };
  fetchedAt: number;
}

const LIVE_STALE_MS = 30_000;

const latestCache = new Map<string, LatestTabBundle>();
const closingCache = new Map<string, ClosingTabBundle>();
const reviewBundleCache = new Map<string, ReviewTabBundle>();

export function latestTabCacheKey(tab: TabKey, tradeDate: string): string {
  if (tab === "overview" || tab === "stock") {
    return `stock-like:${tradeDate}`;
  }
  if (isStockLikeTab(tab)) {
    return `${tab}:${tradeDate}`;
  }
  return `${tab}:${tradeDate}`;
}

export function closingTabCacheKey(
  tradeDate: string,
  thresholds: ClosingThresholds,
): string {
  return `${tradeDate}:${closingThresholdsToQuery(thresholds)}`;
}

export function reviewTabCacheKey(
  tradeDate: string,
  groupBy: RotationGroupBy,
  days: number,
  thresholdsQuery: string,
): string {
  return `${tradeDate}:${groupBy}:${days}:${thresholdsQuery}`;
}

export function isHistoricalTradeDate(tradeDate: string): boolean {
  return tradeDate < todayYyyymmdd();
}

export function shouldRefreshTabData(tradeDate: string, fetchedAt: number): boolean {
  if (isHistoricalTradeDate(tradeDate)) {
    return false;
  }
  return Date.now() - fetchedAt >= LIVE_STALE_MS;
}

export function getLatestTabCache(key: string): LatestTabBundle | null {
  return latestCache.get(key) ?? null;
}

export function setLatestTabCache(key: string, bundle: LatestTabBundle): void {
  latestCache.set(key, bundle);
}

export function getClosingTabCache(key: string): ClosingTabBundle | null {
  return closingCache.get(key) ?? null;
}

export function setClosingTabCache(key: string, bundle: ClosingTabBundle): void {
  closingCache.set(key, bundle);
}

export interface ReviewTabBundle {
  data: RotationReviewResult;
  fetchedAt: number;
}

export function getReviewTabCache(key: string): ReviewTabBundle | null {
  return reviewBundleCache.get(key) ?? null;
}

export function setReviewTabCache(key: string, data: RotationReviewResult): void {
  reviewBundleCache.set(key, { data, fetchedAt: Date.now() });
}

export function clearTabCachesForDate(tradeDate: string): void {
  for (const key of latestCache.keys()) {
    if (key.endsWith(`:${tradeDate}`) || key === `stock-like:${tradeDate}`) {
      latestCache.delete(key);
    }
  }
  for (const key of closingCache.keys()) {
    if (key.startsWith(`${tradeDate}:`)) {
      closingCache.delete(key);
    }
  }
  for (const key of reviewBundleCache.keys()) {
    if (key.startsWith(`${tradeDate}:`)) {
      reviewBundleCache.delete(key);
    }
  }
}
