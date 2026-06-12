"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { formatPercent } from "@/lib/eastmoney/client";
import type { ClosingMoveRow } from "@/lib/analytics/closing-move";
import {
  matchesDownPattern,
  matchesWeakGainPattern,
  type ClosingContinuationStats,
  WEAK_GAIN_THRESHOLD,
} from "@/lib/analytics/closing-continuation-stats";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center text-zinc-500">图表加载中...</div>
  ),
});

interface ClosingContinuationStatsPanelProps {
  stats: ClosingContinuationStats | null;
  todayRows: ClosingMoveRow[];
  loading?: boolean;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
    </div>
  );
}

export function ClosingContinuationStatsPanel({
  stats,
  todayRows,
  loading,
}: ClosingContinuationStatsPanelProps) {
  const todayWeakCount = useMemo(
    () => todayRows.filter((row) => matchesWeakGainPattern(row.changeRatio)).length,
    [todayRows],
  );
  const todayDownCount = useMemo(
    () => todayRows.filter((row) => matchesDownPattern(row.changeRatio)).length,
    [todayRows],
  );

  const weakBucket = stats?.buckets.find((b) => b.key === "weak-gain");
  const allBucket = stats?.buckets.find((b) => b.key === "all");

  const chartOption = useMemo((): EChartsOption | null => {
    if (!stats || stats.totalSamples === 0) return null;

    const visible = stats.buckets.filter((b) => b.sampleCount > 0);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          const bucket = visible[item.dataIndex];
          if (!bucket) return "";
          return [
            bucket.label,
            `隔日上涨概率 ${Math.round(bucket.nextDayUpRate * 100)}%`,
            `样本 ${bucket.sampleCount} 条`,
            `隔日均涨 ${(bucket.avgNextDayChange * 100).toFixed(2)}%`,
          ].join("<br/>");
        },
      },
      grid: { left: 40, right: 16, top: 16, bottom: 56 },
      xAxis: {
        type: "category",
        data: visible.map((b) => b.label),
        axisLabel: {
          color: "#71717a",
          interval: 0,
          rotate: visible.length > 3 ? 18 : 0,
          fontSize: 10,
        },
      },
      yAxis: {
        type: "value",
        name: "隔日上涨%",
        max: 100,
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: visible.map((b) => ({
            value: Number((b.nextDayUpRate * 100).toFixed(1)),
            itemStyle: {
              color:
                b.key === "weak-gain"
                  ? "#FF5500"
                  : b.key === "all"
                    ? "#3b82f6"
                    : "#71717a",
            },
          })),
          label: {
            show: true,
            position: "top",
            color: "#a1a1aa",
            formatter: (p) => `${p.value}%`,
            fontSize: 10,
          },
        },
      ],
    };
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-8 text-center text-sm text-zinc-500">
        隔日上涨概率统计加载中...
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-zinc-200">隔日上涨概率统计</h3>
        <p className="mt-1 text-xs text-zinc-500">
          回看近 {stats.days} 个交易日、{stats.pairCount} 组相邻日，统计「昨日尾盘资金走强 →
          今日是否上涨」。重点看走强但涨幅≤{WEAK_GAIN_THRESHOLD * 100}%（含下跌）的形态。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="走强·涨幅≤2% 隔日上涨"
          value={
            weakBucket && weakBucket.sampleCount > 0
              ? `${Math.round(weakBucket.nextDayUpRate * 100)}%`
              : "—"
          }
          sub={
            weakBucket && weakBucket.sampleCount > 0
              ? `${weakBucket.sampleCount} 条样本 · 均涨 ${formatPercent(weakBucket.avgNextDayChange)}`
              : "样本不足"
          }
          accent="text-[#FF5500]"
        />
        <StatCard
          label="全部异动 隔日上涨"
          value={
            allBucket && allBucket.sampleCount > 0
              ? `${Math.round(allBucket.nextDayUpRate * 100)}%`
              : "—"
          }
          sub={
            allBucket && allBucket.sampleCount > 0
              ? `${allBucket.sampleCount} 条历史样本`
              : undefined
          }
        />
        <StatCard
          label="今日·走强弱涨幅"
          value={`${todayWeakCount} 只`}
          sub={`占今日异动 ${todayRows.length > 0 ? Math.round((todayWeakCount / todayRows.length) * 100) : 0}%`}
          accent="text-[#FF5500]"
        />
        <StatCard
          label="今日·走强下跌"
          value={`${todayDownCount} 只`}
          sub={
            stats.buckets.find((b) => b.key === "down")?.sampleCount
              ? `历史隔日上涨 ${Math.round((stats.buckets.find((b) => b.key === "down")!.nextDayUpRate) * 100)}%`
              : undefined
          }
        />
      </div>

      {stats.insights.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-zinc-400">
          {stats.insights.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      )}

      {chartOption && (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
          <p className="mb-2 text-[10px] text-zinc-500">各形态历史隔日上涨概率对比</p>
          <ReactECharts option={chartOption} style={{ height: 260, width: "100%" }} lazyUpdate />
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-500">
              <th className="px-2 py-2 font-medium">形态</th>
              <th className="px-2 py-2 font-medium">样本</th>
              <th className="px-2 py-2 font-medium">隔日上涨</th>
              <th className="px-2 py-2 font-medium">上涨概率</th>
              <th className="px-2 py-2 font-medium">当日均涨</th>
              <th className="px-2 py-2 font-medium">隔日均涨</th>
            </tr>
          </thead>
          <tbody>
            {stats.buckets.map((bucket) => (
              <tr
                key={bucket.key}
                className={`border-b border-zinc-900/80 ${
                  bucket.key === "weak-gain" ? "bg-orange-950/10" : ""
                }`}
              >
                <td className="px-2 py-2">
                  <div className="font-medium text-zinc-200">{bucket.label}</div>
                  <div className="text-[10px] text-zinc-500">{bucket.description}</div>
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">{bucket.sampleCount}</td>
                <td className="px-2 py-2 tabular-nums text-zinc-300">{bucket.nextDayUpCount}</td>
                <td className="px-2 py-2 tabular-nums font-medium text-[#FF5500]">
                  {bucket.sampleCount > 0
                    ? `${Math.round(bucket.nextDayUpRate * 100)}%`
                    : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-400">
                  {bucket.sampleCount > 0 ? formatPercent(bucket.avgPrevChange) : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums text-zinc-400">
                  {bucket.sampleCount > 0 ? formatPercent(bucket.avgNextDayChange) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats.message && stats.totalSamples === 0 && (
        <p className="mt-3 text-xs text-zinc-500">{stats.message}</p>
      )}
    </div>
  );
}
