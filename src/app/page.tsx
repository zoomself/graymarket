"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DatePicker, buildAllowedTradeDates, isAllowedTradeDate, todayYyyymmdd } from "@/components/DatePicker";
import { ClosingMoveTable } from "@/components/ClosingMoveTable";
import { ClosingThresholdControls } from "@/components/ClosingThresholdControls";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import { DarkTradeTable, type TableSnapshot } from "@/components/DarkTradeTable";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { SearchBox } from "@/components/SearchBox";
import {
  invalidateStockHistoryCache,
  preloadChartLibrary,
} from "@/lib/client/stock-history-cache";
import type { ClosingMoveRow } from "@/lib/analytics/closing-move";
import {
  closingThresholdsToQuery,
  DEFAULT_CLOSING_THRESHOLDS,
  loadClosingThresholdsFromStorage,
  saveClosingThresholdsToStorage,
  type ClosingThresholds,
} from "@/lib/analytics/closing-thresholds";
import { TABS, dedupeSnapshotsByStockCode, filterSnapshots, type TabKey } from "@/lib/eastmoney/tabs";
import type { SortDirection, SortField } from "@/lib/eastmoney/types";

interface IterationInfo {
  id: string;
  tradeDate: string;
  iterationNo: number;
  completedAt: string | null;
  recordCount: number;
  totalCount?: number;
  status?: string;
}

interface ClosingMeta {
  baselineIterationNo: number | null;
  latestIterationNo: number | null;
  morningIterationNo: number | null;
  baselineTime: string | null;
  latestTime: string | null;
  iterationCount: number;
  message?: string | null;
}

const POLL_INTERVAL_MS = 5000;
const DISCLAIMER_KEY = "graymarket-disclaimer";

function formatTradeDateLabel(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export default function HomePage() {
  const [tradeDate, setTradeDate] = useState(todayYyyymmdd);
  const [rows, setRows] = useState<TableSnapshot[]>([]);
  const [iteration, setIteration] = useState<IterationInfo | null>(null);
  const [dataSource, setDataSource] = useState<"database" | "live" | "none" | null>(null);
  const [liveComplete, setLiveComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("darkCapital");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedStock, setSelectedStock] = useState<TableSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [closingRows, setClosingRows] = useState<ClosingMoveRow[]>([]);
  const [closingMeta, setClosingMeta] = useState<ClosingMeta | null>(null);
  const [closingThresholds, setClosingThresholds] = useState<ClosingThresholds>(
    DEFAULT_CLOSING_THRESHOLDS,
  );
  const [thresholdsReady, setThresholdsReady] = useState(false);
  const [closingApplying, setClosingApplying] = useState(false);
  const [closingAppliedAt, setClosingAppliedAt] = useState<number | null>(null);
  const closingThresholdsRef = useRef(closingThresholds);
  const [searchQuery, setSearchQuery] = useState("");
  const [disclaimerAck, setDisclaimerAck] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
      setDisclaimerAck(localStorage.getItem(DISCLAIMER_KEY) === "1");
      setClosingThresholds(loadClosingThresholdsFromStorage());
      setThresholdsReady(true);
    });
  }, []);

  useEffect(() => {
    closingThresholdsRef.current = closingThresholds;
  }, [closingThresholds]);

  const loadClosing = useCallback(
    async (showLoading: boolean, thresholds: ClosingThresholds) => {
      if (showLoading) {
        setLoading(true);
      }
      try {
        const res = await fetch(
          `/api/closing/moves?date=${tradeDate}&${closingThresholdsToQuery(thresholds)}`,
          { cache: "no-store" },
        );
        const data = await res.json();

        if (data.error) {
          setError(data.error);
          return false;
        }

        setError(null);
        setDataSource("database");
        setLiveComplete(true);
        setListMessage(data.message ?? null);
        setClosingRows(data.rows ?? []);
        setClosingMeta({
          baselineIterationNo: data.baselineIterationNo ?? null,
          latestIterationNo: data.latestIterationNo ?? null,
          morningIterationNo: data.morningIterationNo ?? null,
          baselineTime: data.baselineTime ?? null,
          latestTime: data.latestTime ?? null,
          iterationCount: data.iterationCount ?? 0,
          message: data.message ?? null,
        });
        setIteration(
          data.latestIterationNo
            ? {
                id: "closing",
                tradeDate,
                iterationNo: data.latestIterationNo,
                completedAt: data.latestTime ?? null,
                recordCount: data.rows?.length ?? 0,
                status: "completed",
              }
            : null,
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        return false;
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [tradeDate],
  );

  const handleClosingThresholdsApply = useCallback(
    async (next: ClosingThresholds) => {
      setClosingApplying(true);
      setClosingThresholds(next);
      saveClosingThresholdsToStorage(next);
      closingThresholdsRef.current = next;
      const ok = await loadClosing(true, next);
      if (ok) {
        setClosingAppliedAt(Date.now());
      }
      setClosingApplying(false);
    },
    [loadClosing],
  );

  useEffect(() => {
    if (activeTab === "stock" || activeTab === "overview" || activeTab === "closing") {
      preloadChartLibrary();
    }
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/iterations/dates")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setAvailableDates(data.dates ?? []);
      })
      .catch(() => {
        // Non-fatal.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allowedDates = useMemo(
    () => buildAllowedTradeDates(availableDates),
    [availableDates],
  );

  useEffect(() => {
    if (availableDates.length === 0) return;
    if (!isAllowedTradeDate(tradeDate, availableDates)) {
      const today = todayYyyymmdd();
      const fallback = allowedDates.includes(today)
        ? today
        : (allowedDates[0] ?? today);
      if (fallback !== tradeDate) {
        setTradeDate(fallback);
        setRows([]);
        setSelectedStock(null);
        setListMessage(null);
        setLoading(true);
      }
    }
  }, [availableDates, allowedDates, tradeDate]);

  const historyVersion =
    iteration && dataSource === "database"
      ? `${iteration.iterationNo}|${iteration.completedAt ?? ""}`
      : undefined;
  const prevHistoryVersion = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      prevHistoryVersion.current &&
      historyVersion &&
      prevHistoryVersion.current !== historyVersion
    ) {
      invalidateStockHistoryCache(tradeDate);
    }
    prevHistoryVersion.current = historyVersion;
  }, [historyVersion, tradeDate]);

  const acknowledgeDisclaimer = () => {
    localStorage.setItem(DISCLAIMER_KEY, "1");
    setDisclaimerAck(true);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadLatest(showLoading: boolean) {
      if (showLoading && !cancelled) {
        setLoading(true);
      }
      try {
        const res = await fetch(
          `/api/iterations/latest?date=${tradeDate}&tab=${activeTab}`,
        );
        const data = await res.json();

        if (cancelled) return;

        if (data.error) {
          setError(data.error);
          return;
        }

        setError(null);
        setListMessage(data.message ?? null);
        setDataSource(data.source ?? "database");
        setLiveComplete(data.complete !== false);
        setIteration(data.iteration);
        setRows(
          dedupeSnapshotsByStockCode(
            (data.snapshots ?? []).map(
              (s: {
                stockCode: string;
                stockName: string;
                darkCapital: number;
                openCapital: number;
                darkActivity: number;
                priceRaw: number;
                changeRatio: number;
                rankNo: number;
              }) => ({
                stockCode: s.stockCode,
                stockName: s.stockName,
                darkCapital: s.darkCapital,
                openCapital: s.openCapital,
                darkActivity: s.darkActivity,
                priceRaw: s.priceRaw,
                changeRatio: s.changeRatio,
                rankNo: s.rankNo,
              }),
            ),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const pollInterval =
      dataSource === "live" && !liveComplete ? 15_000 : POLL_INTERVAL_MS;

    if (!thresholdsReady) return;

    const initialTimer = window.setTimeout(() => {
      if (cancelled) return;
      if (activeTab === "closing") {
        void loadClosing(true, closingThresholdsRef.current);
      } else {
        void loadLatest(true);
      }
    }, 0);
    const pollTimer = window.setInterval(() => {
      if (cancelled) return;
      if (activeTab === "closing") {
        void loadClosing(false, closingThresholdsRef.current);
      } else {
        void loadLatest(false);
      }
    }, pollInterval);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [tradeDate, activeTab, dataSource, liveComplete, thresholdsReady, loadClosing]);

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSelectedStock(null);
    setSearchQuery("");
    setRows([]);
    setClosingRows([]);
    setClosingMeta(null);
    setLoading(true);
  };

  const filteredRows = useMemo(
    () => filterSnapshots(rows, searchQuery),
    [rows, searchQuery],
  );

  const filteredClosingRows = useMemo(
    () => filterSnapshots(closingRows, searchQuery),
    [closingRows, searchQuery],
  );

  const handleTradeDateChange = (date: string) => {
    if (date === tradeDate) return;
    if (!isAllowedTradeDate(date, availableDates)) return;
    setTradeDate(date);
    setSelectedStock(null);
    setSearchQuery("");
    setRows([]);
    setClosingRows([]);
    setClosingMeta(null);
    setListMessage(null);
    setLoading(true);
    invalidateStockHistoryCache(tradeDate);
    invalidateStockHistoryCache(date);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const tabs = TABS;

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-zinc-100">
      {mounted && !disclaimerAck && (
        <DisclaimerBanner
          acknowledged={false}
          blocking
          onAcknowledge={acknowledgeDisclaimer}
        />
      )}

      <header className="relative z-30 border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[#FF5500]">暗盘资金榜</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">监测主力交易动向 · 把握投资机会</p>
          </div>
          <DatePicker
            value={tradeDate}
            onChange={handleTradeDateChange}
            maxDate={todayYyyymmdd()}
            allowedDates={allowedDates}
          />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-5">
        {disclaimerAck && <DisclaimerBanner acknowledged />}

        <div className="mt-4 flex gap-4 border-b border-zinc-800 text-sm">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`cursor-pointer border-b-2 px-1 pb-3 transition ${
                  active
                    ? "border-[#FF5500] text-[#FF5500]"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {activeTab !== "overview" && (
            <SearchBox value={searchQuery} onChange={setSearchQuery} />
          )}
          {activeTab === "overview" && <div className="flex-1" />}
          <div className="text-sm text-zinc-400">
            {activeTab === "closing" ? (
              closingMeta ? (
                <>
                  13:00基准 #{closingMeta.baselineIterationNo ?? "—"} → 最新 #
                  <span className="text-[#FF5500]">{closingMeta.latestIterationNo ?? "—"}</span>
                  {" · "}
                  命中 {closingRows.length} 只
                  {searchQuery.trim() && (
                    <>
                      {" · "}
                      筛选 {filteredClosingRows.length} 只
                    </>
                  )}
                  {closingMeta.latestTime && (
                    <>
                      {" · "}
                      更新{" "}
                      {new Date(closingMeta.latestTime).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </>
                  )}
                </>
              ) : loading ? (
                "正在分析尾盘异动..."
              ) : (
                listMessage ?? `${formatTradeDateLabel(tradeDate)} 暂无尾盘数据`
              )
            ) : iteration ? (
              <>
                {dataSource === "live" ? (
                  <>
                    <span className="text-amber-400">
                      实时预览
                      {!liveComplete && iteration.totalCount
                        ? "（完整数据加载中…）"
                        : ""}
                    </span>
                    {" · "}
                    共{" "}
                    {!liveComplete &&
                    iteration.totalCount &&
                    iteration.recordCount < iteration.totalCount
                      ? `${iteration.recordCount} / ${iteration.totalCount}`
                      : iteration.totalCount ?? iteration.recordCount}{" "}
                    条
                    {searchQuery.trim() && (
                      <>
                        {" · "}
                        筛选 {filteredRows.length} 条
                      </>
                    )}
                    {" · "}
                    <span className="text-zinc-500">
                      运行 npm run worker:once 可持久化到 Supabase
                    </span>
                  </>
                ) : (
                  <>
                    当前轮次{" "}
                    <span className="text-[#FF5500]">#{iteration.iterationNo}</span>
                    {" · "}
                    共 {iteration.recordCount} 条
                    {searchQuery.trim() && (
                      <>
                        {" · "}
                        筛选 {filteredRows.length} 条
                      </>
                    )}
                    {iteration.completedAt && (
                      <>
                        {" · "}
                        更新{" "}
                        {new Date(iteration.completedAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </>
                    )}
                  </>
                )}
              </>
            ) : loading ? (
              "正在加载数据..."
            ) : listMessage ? (
              listMessage
            ) : (
              `${formatTradeDateLabel(tradeDate)} 暂无数据`
            )}
          </div>
          {error && <span className="text-red-400">{error}</span>}
        </div>

        <div className="mt-4">
          {activeTab === "overview" ? (
            <OverviewDashboard
              rows={rows}
              tradeDate={tradeDate}
              tradeDateLabel={formatTradeDateLabel(tradeDate)}
              loading={loading}
              emptyMessage={
                listMessage ?? `${formatTradeDateLabel(tradeDate)} 暂无暗盘数据`
              }
            />
          ) : activeTab === "closing" ? (
            <div className="space-y-3">
              <ClosingThresholdControls
                value={closingThresholds}
                onApply={handleClosingThresholdsApply}
                applying={closingApplying}
                appliedAt={closingAppliedAt}
              />
              <ClosingMoveTable
              rows={closingRows}
              baselineIterationNo={closingMeta?.baselineIterationNo ?? null}
              latestIterationNo={closingMeta?.latestIterationNo ?? null}
              morningIterationNo={closingMeta?.morningIterationNo ?? null}
              baselineTime={closingMeta?.baselineTime ?? null}
              latestTime={closingMeta?.latestTime ?? null}
              iterationCount={closingMeta?.iterationCount ?? 0}
              tradeDate={tradeDate}
              searchQuery={searchQuery}
              latestCapturedAt={closingMeta?.latestTime ?? undefined}
              historyVersion={historyVersion}
              loading={loading}
              emptyMessage={
                closingMeta?.message ??
                listMessage ??
                (searchQuery.trim() && closingRows.length > 0
                  ? "未找到匹配的标的"
                  : `${formatTradeDateLabel(tradeDate)} 暂无符合条件的尾盘异动`)
              }
            />
            </div>
          ) : (
            <DarkTradeTable
              rows={filteredRows}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onRowClick={
                activeTab === "stock"
                  ? (row) =>
                      setSelectedStock((prev) =>
                        prev?.stockCode === row.stockCode ? null : row,
                      )
                  : undefined
              }
              selectedStockCode={
                activeTab === "stock" ? selectedStock?.stockCode : null
              }
              tradeDate={tradeDate}
              latestIterationNo={iteration?.iterationNo}
              latestCapturedAt={iteration?.completedAt}
              historyVersion={historyVersion}
              liveUpdates={dataSource === "database" || dataSource === "live"}
              loading={loading}
              emptyMessage={
                listMessage ??
                (searchQuery.trim() && rows.length > 0
                  ? "未找到匹配的标的"
                  : `${formatTradeDateLabel(tradeDate)} 暂无暗盘数据`)
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
