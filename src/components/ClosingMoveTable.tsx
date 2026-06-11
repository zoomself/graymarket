"use client";

import { Fragment, useMemo, useState } from "react";
import {
  formatCapital,
  formatPercent,
  formatPrice,
} from "@/lib/eastmoney/client";
import {
  CLOSING_SIGNAL_LABELS,
  type ClosingMoveRow,
  type ClosingSignalType,
} from "@/lib/analytics/closing-move";
import { filterSnapshots } from "@/lib/eastmoney/tabs";
import { StockInlineChart } from "@/components/StockInlineChart";
import { prefetchStockHistory } from "@/lib/client/stock-history-cache";
import type { TableSnapshot } from "@/components/DarkTradeTable";

type SortKey = "score" | "darkDelta" | "openDelta" | "changeRatio" | "darkCapital";
type SignalFilter = "all" | ClosingSignalType;

interface ClosingMoveTableProps {
  rows: ClosingMoveRow[];
  baselineIterationNo: number | null;
  latestIterationNo: number | null;
  morningIterationNo?: number | null;
  baselineTime: string | null;
  latestTime: string | null;
  iterationCount: number;
  tradeDate: string;
  searchQuery: string;
  latestCapturedAt?: string | null;
  historyVersion?: string;
  loading?: boolean;
  emptyMessage?: string;
}

function colorClass(value: number): string {
  if (value > 0) return "text-rise";
  if (value < 0) return "text-fall";
  return "text-zinc-300";
}

function formatDelta(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return prefix + formatCapital(value);
}

function formatTimeLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTableSnapshot(row: ClosingMoveRow): TableSnapshot {
  return {
    stockCode: row.stockCode,
    stockName: row.stockName,
    darkCapital: row.darkCapital,
    openCapital: row.openCapital,
    darkActivity: row.darkActivity,
    priceRaw: row.priceRaw,
    changeRatio: row.changeRatio,
    rankNo: row.rankNo,
  };
}

function tagClass(tag: string): string {
  if (tag.includes("双双") || tag.includes("V形")) {
    return "bg-violet-950/70 text-violet-300";
  }
  if (tag.includes("负转正")) {
    return "bg-blue-950/80 text-[#3b82f6]";
  }
  if (tag.includes("走强")) {
    return "bg-orange-950/60 text-[#FF5500]";
  }
  return "bg-zinc-800 text-zinc-300";
}

const FILTER_OPTIONS: Array<{ key: SignalFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "both", label: "双双走强" },
  { key: "dark", label: "暗盘走强" },
];

export function ClosingMoveTable({
  rows,
  baselineIterationNo,
  latestIterationNo,
  morningIterationNo,
  baselineTime,
  latestTime,
  iterationCount,
  tradeDate,
  searchQuery,
  latestCapturedAt,
  historyVersion,
  loading,
  emptyMessage,
}: ClosingMoveTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDesc, setSortDesc] = useState(true);
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = filterSnapshots(rows, searchQuery);
    if (signalFilter !== "all") {
      list = list.filter((row) => row.signalType === signalFilter);
    }
    return list;
  }, [rows, searchQuery, signalFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((value) => !value);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => {
    const active = sortKey === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={`inline-flex items-center gap-1 hover:text-[#FF5500] ${active ? "text-[#FF5500]" : ""}`}
      >
        {label}
        {active && <span>{sortDesc ? "↓" : "↑"}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs leading-relaxed text-zinc-400">
        自下午 <span className="text-zinc-200">13:00</span> 开盘起，以首轮下午采样为基准（#
        {baselineIterationNo ?? "—"}
        {baselineTime ? ` · ${formatTimeLabel(baselineTime)}` : ""}）对比最新轮次（#
        <span className="text-[#FF5500]">{latestIterationNo ?? "—"}</span>
        {latestTime ? ` · ${formatTimeLabel(latestTime)}` : ""}），共 {iterationCount}{" "}
        轮。早盘参考
        {morningIterationNo ? ` #${morningIterationNo}` : "暂无"}，用于识别{" "}
        <span className="text-violet-300">早盘V形</span>。仅保留{" "}
        <span className="text-[#FF5500]">双双走强</span>（暗+明同步增强）与{" "}
        <span className="text-[#3b82f6]">暗盘走强</span>（暗盘独立增强），优先{" "}
        <span className="text-[#3b82f6]">由负转正</span>。
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const active = signalFilter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setSignalFilter(option.key)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                active
                  ? "bg-[#FF5500] text-white"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/80 text-left text-xs text-zinc-500">
              <th className="px-3 py-3 font-medium">名称/代码</th>
              <th className="px-3 py-3 font-medium">类型</th>
              <th className="px-3 py-3 font-medium">
                <SortHeader label="得分" field="score" />
              </th>
              <th className="px-3 py-3 font-medium">标签</th>
              <th className="px-3 py-3 font-medium">最新</th>
              <th className="px-3 py-3 font-medium">
                <SortHeader label="涨幅" field="changeRatio" />
              </th>
              <th className="px-3 py-3 font-medium">
                <SortHeader label="暗盘Δ" field="darkDelta" />
              </th>
              <th className="px-3 py-3 font-medium">
                <SortHeader label="明盘Δ" field="openDelta" />
              </th>
              <th className="px-3 py-3 font-medium">早盘暗盘</th>
              <th className="px-3 py-3 font-medium">13:00暗盘</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-16 text-center text-zinc-500">
                  尾盘异动分析加载中...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-16 text-center text-zinc-500">
                  {emptyMessage ?? "暂无符合条件的尾盘异动标的"}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const expanded = selectedCode === row.stockCode;
                return (
                  <Fragment key={row.stockCode}>
                    <tr
                      className={`cursor-pointer border-b border-zinc-900/80 transition hover:bg-zinc-900/40 ${
                        expanded ? "bg-zinc-900/50" : ""
                      }`}
                      onClick={() =>
                        setSelectedCode((prev) =>
                          prev === row.stockCode ? null : row.stockCode,
                        )
                      }
                      onMouseEnter={() => prefetchStockHistory(row.stockCode, tradeDate)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-zinc-100">{row.stockName}</div>
                        <div className="text-xs text-zinc-500">{row.stockCode}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            row.signalType === "both"
                              ? "bg-orange-950/70 text-[#FF5500]"
                              : "bg-blue-950/70 text-[#3b82f6]"
                          }`}
                        >
                          {CLOSING_SIGNAL_LABELS[row.signalType]}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums font-semibold ${colorClass(row.score)}`}>
                        {row.score.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex max-w-[9rem] flex-wrap gap-1">
                          {row.tags
                            .filter((tag) => tag !== CLOSING_SIGNAL_LABELS[row.signalType])
                            .map((tag) => (
                              <span
                                key={tag}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${tagClass(tag)}`}
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.changeRatio)}`}>
                        {formatPrice(row.priceRaw)}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.changeRatio)}`}>
                        {formatPercent(row.changeRatio)}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums font-medium ${colorClass(row.darkDelta)}`}>
                        {formatDelta(row.darkDelta)}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.openDelta)}`}>
                        {formatDelta(row.openDelta)}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums text-zinc-500 ${colorClass(row.morningDark ?? 0)}`}>
                        {row.morningDark !== null ? formatCapital(row.morningDark) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.baselineDark)}`}>
                        {formatCapital(row.baselineDark)}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-zinc-800 bg-zinc-950/90">
                        <td colSpan={10} className="px-3 py-3">
                          <StockInlineChart
                            stockCode={row.stockCode}
                            stockName={row.stockName}
                            tradeDate={tradeDate}
                            snapshot={toTableSnapshot(row)}
                            latestIterationNo={latestIterationNo ?? undefined}
                            latestCapturedAt={latestCapturedAt}
                            historyVersion={historyVersion}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
