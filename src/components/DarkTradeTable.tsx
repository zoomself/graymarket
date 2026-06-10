"use client";

import { Fragment } from "react";
import {
  formatCapital,
  formatPercent,
  formatPrice,
} from "@/lib/eastmoney/client";
import type { SortDirection, SortField } from "@/lib/eastmoney/types";
import { StockInlineChart } from "@/components/StockInlineChart";
import { prefetchStockHistory } from "@/lib/client/stock-history-cache";

export interface TableSnapshot {
  stockCode: string;
  stockName: string;
  darkCapital: number;
  openCapital: number;
  darkActivity: number;
  priceRaw: number;
  changeRatio: number;
  rankNo: number;
}

interface DarkTradeTableProps {
  rows: TableSnapshot[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onRowClick?: (row: TableSnapshot) => void;
  selectedStockCode?: string | null;
  tradeDate?: string;
  latestIterationNo?: number;
  latestCapturedAt?: string | null;
  historyVersion?: string;
  liveUpdates?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const active = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 hover:text-[#FF5500] ${active ? "text-[#FF5500]" : ""}`}
    >
      {label}
      {active && <span>{direction === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}

function colorClass(value: number): string {
  if (value > 0) return "text-rise";
  if (value < 0) return "text-fall";
  return "text-zinc-300";
}

export function DarkTradeTable({
  rows,
  sortField,
  sortDirection,
  onSort,
  onRowClick,
  selectedStockCode,
  tradeDate,
  latestIterationNo,
  latestCapturedAt,
  historyVersion,
  liveUpdates,
  loading,
  emptyMessage,
}: DarkTradeTableProps) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    return sortDirection === "desc" ? bv - av : av - bv;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-xs text-zinc-400">
              <th className="px-3 py-3 font-medium">排名</th>
              <th className="px-3 py-3 font-medium">名称/代码</th>
              <th className="px-3 py-3 font-medium text-right">最新</th>
              <th className="px-3 py-3 font-medium text-right">
                <SortHeader
                  label="涨幅"
                  field="changeRatio"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-3 py-3 font-medium text-right">
                <SortHeader
                  label="暗盘资金"
                  field="darkCapital"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-3 py-3 font-medium text-right">
                <SortHeader
                  label="明盘资金"
                  field="openCapital"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-3 py-3 font-medium text-right">
                <SortHeader
                  label="暗盘活跃度"
                  field="darkActivity"
                  activeField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                  数据加载中...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                  {emptyMessage ?? "暂无数据，请检查日期是否为交易日"}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const selected = selectedStockCode === row.stockCode;
                return (
                  <Fragment key={row.stockCode}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onMouseEnter={
                        onRowClick && tradeDate
                          ? () => prefetchStockHistory(row.stockCode, tradeDate)
                          : undefined
                      }
                      className={`border-b border-zinc-900/80 transition ${
                        onRowClick ? "cursor-pointer hover:bg-zinc-900/60" : ""
                      } ${selected ? "bg-zinc-900/80" : ""}`}
                    >
                      <td className="px-3 py-3 text-zinc-400">{row.rankNo}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-zinc-100">{row.stockName}</div>
                        <div className="text-xs text-zinc-500">{row.stockCode}</div>
                      </td>
                      <td className={`px-3 py-3 text-right ${colorClass(row.changeRatio)}`}>
                        {formatPrice(row.priceRaw)}
                      </td>
                      <td className={`px-3 py-3 text-right ${colorClass(row.changeRatio)}`}>
                        {formatPercent(row.changeRatio)}
                      </td>
                      <td className={`px-3 py-3 text-right ${colorClass(row.darkCapital)}`}>
                        {formatCapital(row.darkCapital)}
                      </td>
                      <td className={`px-3 py-3 text-right ${colorClass(row.openCapital)}`}>
                        {formatCapital(row.openCapital)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-300">
                        {formatPercent(row.darkActivity)}
                      </td>
                    </tr>
                    {selected && tradeDate && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <StockInlineChart
                            stockCode={row.stockCode}
                            stockName={row.stockName}
                            tradeDate={tradeDate}
                            snapshot={row}
                            latestIterationNo={latestIterationNo}
                            latestCapturedAt={latestCapturedAt}
                            historyVersion={historyVersion}
                            liveUpdates={liveUpdates}
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
