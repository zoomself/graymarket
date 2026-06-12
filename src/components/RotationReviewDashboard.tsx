"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { formatCapital, formatPercent } from "@/lib/eastmoney/client";
import {
  formatRotationIndex,
  type RotationGroupBy,
  type RotationReviewResult,
  type SectorRotationRow,
} from "@/lib/analytics/sector-rotation";
import {
  CLOSING_SIGNAL_LABELS,
  type ClosingSignalType,
} from "@/lib/analytics/closing-move";
import {
  filterRowsForScatter,
  type ClosingFollowThroughRow,
} from "@/lib/analytics/closing-follow-through";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-zinc-500">图表加载中...</div>
  ),
});

const DAY_OPTIONS = [5, 10, 15, 20] as const;

interface RotationReviewDashboardProps {
  endDate: string;
  endDateLabel: string;
  searchQuery: string;
  loading?: boolean;
  data: RotationReviewResult | null;
  groupBy: RotationGroupBy;
  days: number;
  onGroupByChange: (value: RotationGroupBy) => void;
  onDaysChange: (value: number) => void;
  emptyMessage?: string;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function colorClass(value: number): string {
  if (value > 0) return "text-rise";
  if (value < 0) return "text-fall";
  return "text-zinc-300";
}

function tagClass(tag: string): string {
  if (tag.includes("持续") || tag.includes("接力")) return "bg-orange-950/60 text-[#FF5500]";
  if (tag.includes("轮动") || tag.includes("新热点")) return "bg-violet-950/70 text-violet-300";
  if (tag.includes("降温")) return "bg-zinc-800 text-zinc-400";
  return "bg-blue-950/80 text-[#3b82f6]";
}

function followTagClass(tag: string): string {
  if (tag.includes("大涨") || tag.includes("延续") || tag.includes("接力") || tag.includes("验证")) {
    return "bg-orange-950/60 text-[#FF5500]";
  }
  if (tag.includes("兑现") || tag.includes("回调") || tag.includes("走弱") || tag.includes("撤离")) {
    return "bg-zinc-800 text-zinc-400";
  }
  return "bg-blue-950/80 text-[#3b82f6]";
}

function closingTagClass(tag: string): string {
  if (tag.includes("双双") || tag.includes("V形")) return "bg-violet-950/70 text-violet-300";
  if (tag.includes("负转正")) return "bg-blue-950/80 text-[#3b82f6]";
  if (tag.includes("走强")) return "bg-orange-950/60 text-[#FF5500]";
  return "bg-zinc-800 text-zinc-300";
}

export function RotationReviewDashboard({
  endDateLabel,
  searchQuery,
  loading,
  data,
  groupBy,
  days,
  onGroupByChange,
  onDaysChange,
  emptyMessage,
}: RotationReviewDashboardProps) {
  const [tagFilter, setTagFilter] = useState<string>("all");

  useEffect(() => {
    setTagFilter("all");
  }, [groupBy, days, data?.endDate]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.sectorRows.filter((row) => {
      if (tagFilter !== "all" && !row.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return row.sector.toLowerCase().includes(q);
    });
  }, [data, searchQuery, tagFilter]);

  const followThrough = data?.closingFollowThrough ?? null;

  const filteredFollowRows = useMemo(() => {
    if (!followThrough) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return followThrough.rows;
    return followThrough.rows.filter(
      (row) =>
        row.stockCode.toLowerCase().includes(q) ||
        row.stockName.toLowerCase().includes(q) ||
        row.industry.toLowerCase().includes(q) ||
        row.concept.toLowerCase().includes(q),
    );
  }, [followThrough, searchQuery]);

  const followThroughCharts = useMemo(() => {
    if (!followThrough || followThrough.rows.length === 0) return null;

    const rows = followThrough.rows;
    const { summary } = followThrough;

    const buckets = [
      { label: "≥5%", count: 0, color: "#ef4444" },
      { label: "2~5%", count: 0, color: "#f97316" },
      { label: "0~2%", count: 0, color: "#a1a1aa" },
      { label: "-2~0%", count: 0, color: "#71717a" },
      { label: "≤-2%", count: 0, color: "#22c55e" },
    ];

    for (const row of rows) {
      const change = row.todayChange;
      if (change >= 0.05) buckets[0].count += 1;
      else if (change >= 0.02) buckets[1].count += 1;
      else if (change > 0) buckets[2].count += 1;
      else if (change > -0.02) buckets[3].count += 1;
      else buckets[4].count += 1;
    }

    const distributionOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 40, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        data: buckets.map((b) => b.label),
        axisLabel: { color: "#71717a" },
      },
      yAxis: {
        type: "value",
        name: "家数",
        minInterval: 1,
        axisLabel: { color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: buckets.map((b) => ({
            value: b.count,
            itemStyle: { color: b.color },
          })),
        },
      ],
    };

    const scatterRows = filterRowsForScatter(rows);
    const scatterExcludedCount = rows.length - scatterRows.length;

    const scatterOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          const item = params as unknown as { data: [number, number, string] };
          const [prev, today, name] = item.data;
          return `${name}<br/>昨日 ${prev.toFixed(2)}% · 今日 ${today.toFixed(2)}%`;
        },
      },
      grid: { left: 48, right: 16, top: 24, bottom: 40 },
      xAxis: {
        type: "value",
        name: "昨日涨幅",
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "value",
        name: "今日涨幅",
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "scatter",
          data: scatterRows.map((row) => [
            Number((row.prevChange * 100).toFixed(2)),
            Number((row.todayChange * 100).toFixed(2)),
            row.stockName,
          ]),
          symbolSize: 9,
          itemStyle: { color: "#FF5500", opacity: 0.75 },
        },
      ],
    };

    const topRows = [...rows]
      .sort((a, b) => b.todayChange - a.todayChange)
      .slice(0, 10);

    const topMoversOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          return `${item.name}<br/>今日涨幅 ${Number(item.value).toFixed(2)}%`;
        },
      },
      grid: { left: 96, right: 24, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "category",
        data: [...topRows].reverse().map((row) => row.stockName),
        axisLabel: { color: "#d4d4d8", width: 72, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: [...topRows].reverse().map((row) => ({
            value: Number((row.todayChange * 100).toFixed(2)),
            itemStyle: { color: row.todayChange >= 0 ? "#ef4444" : "#22c55e" },
          })),
        },
      ],
    };

    const upCount = rows.filter((row) => row.todayChange > 0).length;
    const downCount = rows.filter((row) => row.todayChange < 0).length;
    const flatCount = rows.length - upCount - downCount;

    const outcomeOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      legend: {
        bottom: 0,
        textStyle: { color: "#a1a1aa" },
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "44%"],
          label: { color: "#d4d4d8", formatter: "{b}\n{d}%" },
          data: [
            { name: "收涨", value: upCount, itemStyle: { color: "#ef4444" } },
            { name: "收跌", value: downCount, itemStyle: { color: "#22c55e" } },
            { name: "平盘", value: flatCount, itemStyle: { color: "#71717a" } },
          ],
        },
      ],
    };

    const compareOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v) => `${Number(v).toFixed(2)}%`,
      },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        data: ["异动股均涨", "大盘均涨", "超额"],
        axisLabel: { color: "#71717a" },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: [
            {
              value: Number((summary.avgTodayChange * 100).toFixed(2)),
              itemStyle: { color: "#FF5500" },
            },
            {
              value: Number((summary.marketAvgChange * 100).toFixed(2)),
              itemStyle: { color: "#3b82f6" },
            },
            {
              value: Number((summary.avgAlpha * 100).toFixed(2)),
              itemStyle: {
                color: summary.avgAlpha >= 0 ? "#ef4444" : "#22c55e",
              },
            },
          ],
        },
      ],
    };

    return {
      distributionOption,
      scatterOption,
      scatterExcludedCount,
      topMoversOption,
      outcomeOption,
      compareOption,
    };
  }, [followThrough]);

  const charts = useMemo(() => {
    if (!data || data.dates.length < 2) return null;

    const heatmapOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: { position: "top" },
      grid: { left: 96, right: 24, top: 24, bottom: 48 },
      xAxis: {
        type: "category",
        data: data.heatmap.dates,
        axisLabel: { color: "#71717a" },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category",
        data: data.heatmap.sectors,
        axisLabel: { color: "#d4d4d8", width: 80, overflow: "truncate" },
      },
      visualMap: {
        min: -5,
        max: 5,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: "#a1a1aa" },
        inRange: {
          color: ["#22c55e", "#27272a", "#ef4444"],
        },
      },
      series: [
        {
          type: "heatmap",
          data: data.heatmap.values.flatMap((row, y) =>
            row.map((value, x) => [x, y, value]),
          ),
          label: { show: false },
        },
      ],
    };

    const colors = ["#FF5500", "#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ec4899"];
    const trendOption: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: {
        data: data.trendSeries.map((s) => s.sector),
        textStyle: { color: "#a1a1aa" },
        top: 0,
      },
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      xAxis: {
        type: "category",
        data: data.trendSeries[0]?.points.map((p) => p.date) ?? [],
        axisLabel: { color: "#71717a" },
      },
      yAxis: {
        type: "value",
        name: "均涨幅",
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => `${v.toFixed(1)}%`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: data.trendSeries.map((series, index) => ({
        name: series.sector,
        type: "line",
        smooth: true,
        data: series.points.map((p) => Number((p.avgChange * 100).toFixed(2))),
        itemStyle: { color: colors[index % colors.length] },
      })),
    };

    return { heatmapOption, trendOption };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-500">
        历史复盘分析加载中...
      </div>
    );
  }

  if (!data || data.dates.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-500">
        {emptyMessage ?? data?.message ?? "数据不足，需至少 2 个交易日 Worker 采样"}
      </div>
    );
  }

  const groupLabel = groupBy === "industry" ? "行业" : "概念";
  const tagOptions = ["all", "持续强势", "轮动上位", "新热点", "暗盘接力", "降温回调"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          以 {endDateLabel} 为终点，回看最近 {data.dates.length} 个交易日
          {groupLabel}涨幅轮动（样本为每日最后一轮 Worker 快照）。
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-zinc-700 p-0.5">
            {(["industry", "concept"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onGroupByChange(key)}
                className={`rounded-md px-3 py-1 text-xs transition ${
                  groupBy === key
                    ? "bg-[#FF5500] text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {key === "industry" ? "行业" : "概念"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-zinc-700 p-0.5">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onDaysChange(option)}
                className={`rounded-md px-3 py-1 text-xs transition ${
                  days === option
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {option}日
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="轮动指数"
          value={formatRotationIndex(data.rotationIndex)}
          sub="越低表示热点切换越快"
        />
        <StatCard
          label="TOP5 延续率"
          value={`${Math.round(data.continuationRate * 100)}%`}
          sub="昨日 TOP5 留在今日 TOP10 的比例"
        />
        <StatCard
          label={`最新最强${groupLabel}`}
          value={data.dailyLeaders.at(-1)?.top[0]?.sector ?? "—"}
          sub={
            data.dailyLeaders.at(-1)?.top[0]
              ? formatPercent(data.dailyLeaders.at(-1)!.top[0].avgChange)
              : undefined
          }
        />
        <StatCard
          label="跟踪板块数"
          value={`${data.sectorRows.length}`}
          sub={`${data.dates.length} 个交易日`}
        />
      </div>

      {data.insights.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">复盘要点</h3>
          <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
            {data.insights.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      )}

      {charts && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <h3 className="mb-1 text-sm font-medium text-zinc-200">{groupLabel}涨幅热力图</h3>
            <p className="mb-2 text-xs text-zinc-500">横轴为日期，纵轴为活跃板块，颜色为当日均涨幅</p>
            <ReactECharts option={charts.heatmapOption} style={{ height: 320, width: "100%" }} lazyUpdate />
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <h3 className="mb-1 text-sm font-medium text-zinc-200">主线{groupLabel}走势</h3>
            <p className="mb-2 text-xs text-zinc-500">近期最活跃板块的平均涨幅变化</p>
            <ReactECharts option={charts.trendOption} style={{ height: 320, width: "100%" }} lazyUpdate />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-200">每日最强 {groupLabel}</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.dailyLeaders.map((day) => (
            <div key={day.date} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-300">{day.label}</p>
              <div className="space-y-1">
                {day.top.map((item, index) => (
                  <div key={item.sector} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">
                      {index + 1}. {item.sector}
                    </span>
                    <span className={colorClass(item.avgChange)}>
                      {formatPercent(item.avgChange)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3">
          <h3 className="text-sm font-medium text-zinc-200">{groupLabel}轮动榜</h3>
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] transition ${
                  tagFilter === tag
                    ? "bg-[#FF5500] text-white"
                    : "border border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tag === "all" ? "全部" : tag}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-left text-xs text-zinc-500">
                <th className="px-3 py-3 font-medium">{groupLabel}</th>
                <th className="px-3 py-3 font-medium">今日排名</th>
                <th className="px-3 py-3 font-medium">排名变化</th>
                <th className="px-3 py-3 font-medium">今日均涨</th>
                <th className="px-3 py-3 font-medium">昨日均涨</th>
                <th className="px-3 py-3 font-medium">暗盘变化</th>
                <th className="px-3 py-3 font-medium">TOP10 连板</th>
                <th className="px-3 py-3 font-medium">信号</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                    暂无匹配的{groupLabel}
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 50).map((row) => (
                  <RotationRow key={row.sector} row={row} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {followThrough && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="border-b border-zinc-800 bg-zinc-950/80 px-4 py-4">
            <h3 className="text-sm font-medium text-zinc-200">尾盘异动隔日跟踪</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {followThrough.prevDateLabel} 尾盘信号 → {followThrough.todayDateLabel} 表现
              （阈值与「尾盘异动」tab 一致）
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="昨日尾盘信号"
                value={`${followThrough.summary.signalCount} 只`}
                sub={`匹配今日行情 ${followThrough.summary.matchedCount} 只`}
              />
              <StatCard
                label="今日上涨占比"
                value={`${Math.round(followThrough.summary.todayUpRatio * 100)}%`}
                sub={`${followThrough.summary.todayUpCount} 只收涨`}
              />
              <StatCard
                label="异动股均涨"
                value={formatPercent(followThrough.summary.avgTodayChange)}
                sub={`大盘 ${formatPercent(followThrough.summary.marketAvgChange)} · 超额 ${formatPercent(followThrough.summary.avgAlpha)}`}
              />
              <StatCard
                label="隔日大涨/兑现"
                value={`${followThrough.summary.strongContinueCount} / ${followThrough.summary.fadeCount}`}
                sub="涨幅≥5% / 跌幅≤-2%"
              />
            </div>
            {followThrough.insights.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs leading-relaxed text-zinc-400">
                {followThrough.insights.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            )}
          </div>

          {followThroughCharts && (
            <div className="grid gap-4 border-b border-zinc-800 p-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                <h4 className="mb-1 text-xs font-medium text-zinc-300">隔日涨跌分布</h4>
                <p className="mb-2 text-[10px] text-zinc-500">今日涨幅区间家数</p>
                <ReactECharts
                  option={followThroughCharts.distributionOption}
                  style={{ height: 240, width: "100%" }}
                  lazyUpdate
                />
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                <h4 className="mb-1 text-xs font-medium text-zinc-300">隔日胜负占比</h4>
                <p className="mb-2 text-[10px] text-zinc-500">异动股今日收涨 / 收跌 / 平盘</p>
                <ReactECharts
                  option={followThroughCharts.outcomeOption}
                  style={{ height: 240, width: "100%" }}
                  lazyUpdate
                />
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                <h4 className="mb-1 text-xs font-medium text-zinc-300">昨日 vs 今日涨幅</h4>
                <p className="mb-2 text-[10px] text-zinc-500">
                  每只异动股的隔日涨幅散点
                  {followThroughCharts.scatterExcludedCount > 0
                    ? `（已排除 ${followThroughCharts.scatterExcludedCount} 只单日涨跌幅超 50% 的新股）`
                    : "（已排除单日涨跌幅超 50% 的新股）"}
                </p>
                <ReactECharts
                  option={followThroughCharts.scatterOption}
                  style={{ height: 260, width: "100%" }}
                  lazyUpdate
                />
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3">
                <h4 className="mb-1 text-xs font-medium text-zinc-300">均涨对比</h4>
                <p className="mb-2 text-[10px] text-zinc-500">异动股 vs 大盘 vs 超额</p>
                <ReactECharts
                  option={followThroughCharts.compareOption}
                  style={{ height: 260, width: "100%" }}
                  lazyUpdate
                />
              </div>
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 lg:col-span-2">
                <h4 className="mb-1 text-xs font-medium text-zinc-300">今日涨幅 Top10</h4>
                <p className="mb-2 text-[10px] text-zinc-500">昨日尾盘异动中，今日表现最强的前 10 只</p>
                <ReactECharts
                  option={followThroughCharts.topMoversOption}
                  style={{ height: 280, width: "100%" }}
                  lazyUpdate
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-left text-xs text-zinc-500">
                  <th className="px-3 py-3 font-medium">名称/代码</th>
                  <th className="px-3 py-3 font-medium">昨日信号</th>
                  <th className="px-3 py-3 font-medium">昨日涨幅</th>
                  <th className="px-3 py-3 font-medium">昨日暗盘增量</th>
                  <th className="px-3 py-3 font-medium">今日涨幅</th>
                  <th className="px-3 py-3 font-medium">今日暗盘</th>
                  <th className="px-3 py-3 font-medium">暗盘隔夜变化</th>
                  <th className="px-3 py-3 font-medium">隔日标签</th>
                </tr>
              </thead>
              <tbody>
                {filteredFollowRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                      {followThrough.message ??
                        (searchQuery.trim()
                          ? "未找到匹配的标的"
                          : "暂无隔日跟踪数据")}
                    </td>
                  </tr>
                ) : (
                  filteredFollowRows.map((row) => (
                    <FollowThroughRow key={row.stockCode} row={row} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowThroughRow({ row }: { row: ClosingFollowThroughRow }) {
  return (
    <tr className="border-b border-zinc-900/80">
      <td className="px-3 py-2.5">
        <div className="font-medium text-zinc-100">{row.stockName}</div>
        <div className="text-xs text-zinc-500">{row.stockCode}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="mb-1 text-[10px] text-zinc-400">
          {CLOSING_SIGNAL_LABELS[row.signalType as ClosingSignalType]}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.prevTags.map((tag) => (
            <span
              key={tag}
              className={`rounded px-1.5 py-0.5 text-[10px] ${closingTagClass(tag)}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.prevChange)}`}>
        {formatPercent(row.prevChange)}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.prevDarkDelta)}`}>
        {row.prevDarkDelta >= 0 ? "+" : ""}
        {formatCapital(row.prevDarkDelta)}
      </td>
      <td className={`px-3 py-2.5 tabular-nums font-medium ${colorClass(row.todayChange)}`}>
        {formatPercent(row.todayChange)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-zinc-300">
        {formatCapital(row.todayDarkCapital)}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.darkDeltaOvernight)}`}>
        {row.darkDeltaOvernight >= 0 ? "+" : ""}
        {formatCapital(row.darkDeltaOvernight)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded px-1.5 py-0.5 text-[10px] ${followTagClass(tag)}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function RotationRow({ row }: { row: SectorRotationRow }) {
  return (
    <tr className="border-b border-zinc-900/80">
      <td className="px-3 py-2.5 font-medium text-zinc-100">{row.sector}</td>
      <td className="px-3 py-2.5 tabular-nums text-zinc-300">#{row.latestRank}</td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.rankChange)}`}>
        {row.rankChange > 0 ? `+${row.rankChange}` : row.rankChange}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.latestChange)}`}>
        {formatPercent(row.latestChange)}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.prevChange)}`}>
        {formatPercent(row.prevChange)}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${colorClass(row.darkFlowDelta)}`}>
        {row.darkFlowDelta >= 0 ? "+" : ""}
        {formatCapital(row.darkFlowDelta)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-zinc-300">{row.streakTop10} 天</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {row.tags.length === 0 ? (
            <span className="text-xs text-zinc-600">—</span>
          ) : (
            row.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded px-1.5 py-0.5 text-[10px] ${tagClass(tag)}`}
              >
                {tag}
              </span>
            ))
          )}
        </div>
      </td>
    </tr>
  );
}
