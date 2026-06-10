"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { DatePicker, todayYyyymmdd } from "@/components/DatePicker";
import { DarkTradeTable, type TableSnapshot } from "@/components/DarkTradeTable";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { SearchBox } from "@/components/SearchBox";
import {
  invalidateStockHistoryCache,
  preloadChartLibrary,
} from "@/lib/client/stock-history-cache";
import { TABS, filterSnapshots, type TabKey } from "@/lib/eastmoney/tabs";
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

const POLL_INTERVAL_MS = 5000;
const DISCLAIMER_KEY = "graymarket-disclaimer";

export default function HomePage() {
  const [tradeDate, setTradeDate] = useState(todayYyyymmdd);
  const [rows, setRows] = useState<TableSnapshot[]>([]);
  const [iteration, setIteration] = useState<IterationInfo | null>(null);
  const [dataSource, setDataSource] = useState<"database" | "live" | null>(null);
  const [liveComplete, setLiveComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("darkCapital");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedStock, setSelectedStock] = useState<TableSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("stock");
  const [searchQuery, setSearchQuery] = useState("");
  const [disclaimerAck, setDisclaimerAck] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
      setDisclaimerAck(localStorage.getItem(DISCLAIMER_KEY) === "1");
    });
  }, []);

  useEffect(() => {
    if (activeTab === "stock") {
      preloadChartLibrary();
    }
  }, [activeTab]);

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

    async function load(showLoading: boolean) {
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
        setDataSource(data.source ?? "database");
        setLiveComplete(data.complete !== false);
        setIteration(data.iteration);
        setRows(
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

    const initialTimer = window.setTimeout(() => {
      void load(true);
    }, 0);
    const pollTimer = window.setInterval(() => {
      void load(false);
    }, pollInterval);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [tradeDate, activeTab, dataSource, liveComplete]);

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSelectedStock(null);
    setSearchQuery("");
    setRows([]);
    setLoading(true);
  };

  const filteredRows = useMemo(
    () => filterSnapshots(rows, searchQuery),
    [rows, searchQuery],
  );

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

      <header className="relative z-10 border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[#FF5500]">东方财富</span>
              <span className="text-lg font-semibold text-white">暗盘资金榜</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">监测主力交易动向 · 把握投资机会</p>
          </div>
          <DatePicker value={tradeDate} onChange={setTradeDate} />
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
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
          <div className="text-sm text-zinc-400">
            {iteration ? (
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
            ) : (
              "暂无数据"
            )}
          </div>
          {error && <span className="text-red-400">{error}</span>}
        </div>

        <div className="mt-4">
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
              searchQuery.trim() && rows.length > 0
                ? "未找到匹配的标的"
                : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
