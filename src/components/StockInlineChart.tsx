"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildStockChartOption } from "@/lib/client/stock-chart-option";
import {
  fetchStockHistory,
  getCachedStockHistory,
  type StockHistoryPoint,
} from "@/lib/client/stock-history-cache";
import type { TableSnapshot } from "@/components/DarkTradeTable";

const CHART_POLL_MS = 5000;

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center text-zinc-500">
      图表渲染中...
    </div>
  ),
});

interface StockInlineChartProps {
  stockCode: string;
  stockName: string;
  tradeDate: string;
  snapshot: TableSnapshot;
  latestIterationNo?: number;
  latestCapturedAt?: string | null;
  historyVersion?: string;
  liveUpdates?: boolean;
}

function buildLivePoint(
  snapshot: TableSnapshot,
  latestIterationNo?: number,
  latestCapturedAt?: string | null,
): StockHistoryPoint {
  return {
    capturedAt: latestCapturedAt ?? new Date().toISOString(),
    iterationNo: latestIterationNo ?? 0,
    darkCapital: snapshot.darkCapital,
    openCapital: snapshot.openCapital,
    priceRaw: snapshot.priceRaw,
  };
}

function samePointValues(a: StockHistoryPoint, b: StockHistoryPoint): boolean {
  return (
    a.darkCapital === b.darkCapital &&
    a.openCapital === b.openCapital &&
    a.priceRaw === b.priceRaw
  );
}

function mergeLiveSnapshot(
  points: StockHistoryPoint[],
  snapshot: TableSnapshot,
  latestIterationNo?: number,
  latestCapturedAt?: string | null,
): StockHistoryPoint[] {
  const livePoint = buildLivePoint(snapshot, latestIterationNo, latestCapturedAt);
  if (points.length === 0) {
    return [livePoint];
  }

  const last = points[points.length - 1];
  if (samePointValues(last, livePoint)) {
    return points;
  }

  if (livePoint.iterationNo > 0 && livePoint.iterationNo === last.iterationNo) {
    return [...points.slice(0, -1), livePoint];
  }

  if (livePoint.iterationNo > last.iterationNo) {
    return [...points, livePoint];
  }

  if (livePoint.iterationNo === 0) {
    return [...points, livePoint];
  }

  return points;
}

export function StockInlineChart({
  stockCode,
  stockName,
  tradeDate,
  snapshot,
  latestIterationNo,
  latestCapturedAt,
  historyVersion,
  liveUpdates = true,
}: StockInlineChartProps) {
  const [points, setPoints] = useState<StockHistoryPoint[]>(() => {
    const cachedPoints = getCachedStockHistory(stockCode, tradeDate);
    return cachedPoints?.length
      ? cachedPoints
      : [buildLivePoint(snapshot, latestIterationNo, latestCapturedAt)];
  });
  const [loading, setLoading] = useState(
    () => !getCachedStockHistory(stockCode, tradeDate)?.length,
  );
  const [error, setError] = useState<string | null>(null);
  const prevHistoryVersion = useRef<string | undefined>(historyVersion);

  useEffect(() => {
    let cancelled = false;
    const force = prevHistoryVersion.current !== historyVersion;
    prevHistoryVersion.current = historyVersion;

    const cachedPoints = force ? null : getCachedStockHistory(stockCode, tradeDate);

    if (cachedPoints?.length) {
      setPoints(cachedPoints);
      setLoading(false);
      setError(null);
    } else if (!force) {
      setPoints([buildLivePoint(snapshot, latestIterationNo, latestCapturedAt)]);
      setLoading(true);
      setError(null);
    }

    void fetchStockHistory(stockCode, tradeDate, { force })
      .then((history) => {
        if (cancelled) return;
        const base =
          history.length > 0
            ? history
            : [buildLivePoint(snapshot, latestIterationNo, latestCapturedAt)];
        setPoints(
          liveUpdates
            ? mergeLiveSnapshot(base, snapshot, latestIterationNo, latestCapturedAt)
            : base,
        );
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stockCode, tradeDate, historyVersion, latestIterationNo, latestCapturedAt, liveUpdates]);

  useEffect(() => {
    if (!liveUpdates) return;

    setPoints((prev) =>
      mergeLiveSnapshot(prev, snapshot, latestIterationNo, latestCapturedAt),
    );
  }, [
    snapshot.darkCapital,
    snapshot.openCapital,
    snapshot.priceRaw,
    latestIterationNo,
    latestCapturedAt,
    liveUpdates,
    snapshot,
  ]);

  useEffect(() => {
    if (!liveUpdates) return;

    const timer = window.setInterval(() => {
      void fetchStockHistory(stockCode, tradeDate, { force: true })
        .then((history) => {
          setPoints((prev) => {
            const base =
              history.length > 0
                ? history
                : prev.length > 0
                  ? prev
                  : [buildLivePoint(snapshot, latestIterationNo, latestCapturedAt)];
            return mergeLiveSnapshot(base, snapshot, latestIterationNo, latestCapturedAt);
          });
          setError(null);
        })
        .catch(() => {
          // Keep showing the last good chart during transient poll failures.
        });
    }, CHART_POLL_MS);

    return () => window.clearInterval(timer);
  }, [
    stockCode,
    tradeDate,
    liveUpdates,
    snapshot,
    latestIterationNo,
    latestCapturedAt,
  ]);

  const option = useMemo(() => buildStockChartOption(points), [points]);

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-200">{stockName}</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span>{stockCode}</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span>当日走势</span>
          {liveUpdates && (
            <span className="ml-2 text-emerald-500/80">实时更新</span>
          )}
          {points.length > 0 && (
            <span className="ml-2 text-zinc-500">
              共 {points.length} 个采样点
              {loading && " · 同步中…"}
            </span>
          )}
        </p>
      </div>
      {error ? (
        <div className="flex h-52 items-center justify-center text-red-400">{error}</div>
      ) : points.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-zinc-500">
          当日暂无历史数据
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 240, width: "100%" }} notMerge lazyUpdate />
      )}
    </div>
  );
}
