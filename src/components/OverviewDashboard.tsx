"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { formatCapital, formatPercent } from "@/lib/eastmoney/client";
import { computeOverviewAnalytics } from "@/lib/analytics/overview-stats";
import {
  computeMarketBehavior,
  type IntradayBehavior,
  type MarketBehaviorAnalytics,
} from "@/lib/analytics/market-behavior";
import type { TableSnapshot } from "@/components/DarkTradeTable";
import { LabelWithHelp } from "@/components/MetricHelp";
import { METRIC_HELP } from "@/lib/analytics/metric-help-text";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-zinc-500">图表加载中...</div>
  ),
});

interface OverviewDashboardProps {
  rows: TableSnapshot[];
  tradeDate: string;
  tradeDateLabel: string;
  loading?: boolean;
  emptyMessage?: string;
}

function StatCard({
  label,
  help,
  value,
  sub,
  accent,
}: {
  label: string;
  help?: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="overflow-visible rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <p className="text-xs text-zinc-500">
        <LabelWithHelp label={label} help={help} />
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ChartPanel({
  title,
  help,
  subtitle,
  option,
  height = 280,
}: {
  title: string;
  help?: string;
  subtitle?: string;
  option: EChartsOption;
  height?: number;
}) {
  return (
    <div className="overflow-visible rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <h3 className="text-sm font-medium text-zinc-200">
        <LabelWithHelp label={title} help={help} />
      </h3>
      {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        lazyUpdate
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}

function CaseTable({
  title,
  help,
  cases,
  valueLabel,
  valueFormat,
}: {
  title: string;
  help?: string;
  cases: Array<{
    stockName: string;
    stockCode: string;
    tag?: string;
    value: number;
  }>;
  valueLabel: string;
  valueFormat: (value: number) => string;
}) {
  if (cases.length === 0) {
    return (
      <div className="overflow-visible rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <h3 className="text-sm font-medium text-zinc-200">
          <LabelWithHelp label={title} help={help} />
        </h3>
        <p className="mt-4 text-sm text-zinc-500">暂无符合条件的标的</p>
      </div>
    );
  }

  return (
    <div className="overflow-visible rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-200">
        <LabelWithHelp label={title} help={help} />
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-500">
              <th className="pb-2 pr-3 font-medium">名称</th>
              <th className="pb-2 pr-3 font-medium">代码</th>
              {cases[0]?.tag && <th className="pb-2 pr-3 font-medium">归因</th>}
              <th className="pb-2 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => (
              <tr key={item.stockCode} className="border-b border-zinc-900/80">
                <td className="py-2 pr-3 text-zinc-200">{item.stockName}</td>
                <td className="py-2 pr-3 text-zinc-500">{item.stockCode}</td>
                {item.tag && (
                  <td className="py-2 pr-3 text-zinc-400">{item.tag}</td>
                )}
                <td
                  className={`py-2 text-right tabular-nums ${
                    item.value >= 0 ? "text-rise" : "text-fall"
                  }`}
                >
                  {valueFormat(item.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const chartBase = {
  backgroundColor: "transparent",
  textStyle: { color: "#a1a1aa" },
  animation: false,
};

function formatCorrelation(value: number): string {
  return value.toFixed(2);
}

export function OverviewDashboard({
  rows,
  tradeDate,
  tradeDateLabel,
  loading,
  emptyMessage,
}: OverviewDashboardProps) {
  const [intraday, setIntraday] = useState<IntradayBehavior | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/overview/behavior?date=${tradeDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setIntraday(data.intraday ?? null);
      })
      .catch(() => {
        // Intraday stats are optional.
      });

    return () => {
      cancelled = true;
    };
  }, [tradeDate]);

  const analytics = useMemo(() => computeOverviewAnalytics(rows), [rows]);
  const behavior = useMemo(
    () => computeMarketBehavior(rows, intraday),
    [rows, intraday],
  );

  const charts = useMemo(() => {
    if (!analytics || !behavior) return null;

    const topDarkOption: EChartsOption = {
      ...chartBase,
      grid: { left: 96, right: 24, top: 12, bottom: 24 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => formatCapital(v), color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "category",
        data: [...analytics.topDark].reverse().map((item) => item.name),
        axisLabel: { color: "#d4d4d8", width: 72, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: [...analytics.topDark].reverse().map((item) => item.value),
          itemStyle: { color: "#3b82f6" },
        },
      ],
    };

    const changeBucketColors = ["#22c55e", "#71717a", "#ef4444", "#ef4444"];
    const changeOption: EChartsOption = {
      ...chartBase,
      grid: { left: 40, right: 16, top: 24, bottom: 32 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: analytics.changeBuckets.map((b) => b.label),
        axisLabel: { color: "#71717a" },
      },
      yAxis: {
        type: "value",
        name: "家数",
        axisLabel: { color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: analytics.changeBuckets.map((b, index) => ({
            value: b.count,
            itemStyle: { color: changeBucketColors[index] ?? "#71717a" },
          })),
        },
      ],
    };

    const pieData = [
      {
        name: "暗盘资金",
        value: Math.abs(analytics.summary.darkTotal),
        itemStyle: { color: "#3b82f6" },
      },
      {
        name: "明盘资金",
        value: Math.abs(analytics.summary.openTotal),
        itemStyle: { color: "#FF5500" },
      },
    ].filter((item) => item.value > 0);

    const structureOption: EChartsOption = {
      ...chartBase,
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#a1a1aa" } },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "45%"],
          label: { color: "#d4d4d8" },
          data:
            pieData.length > 0
              ? pieData
              : [{ name: "暂无数据", value: 1, itemStyle: { color: "#52525b" } }],
        },
      ],
    };

    const scatterOption: EChartsOption = {
      ...chartBase,
      grid: { left: 56, right: 24, top: 24, bottom: 40 },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (raw) => {
          const params = (Array.isArray(raw) ? raw[0] : raw) as {
            data?: {
              stockName: string;
              stockCode: string;
              changeRatio: number;
              darkCapital: number;
            };
          };
          const point = params.data;
          if (!point || typeof point !== "object") return "";

          return [
            `<span style="font-weight:600">${point.stockName}</span>`,
            `<span style="color:#71717a">${point.stockCode}</span>`,
            `涨幅：${formatPercent(point.changeRatio)}`,
            `暗盘资金：${formatCapital(point.darkCapital)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        name: "涨幅",
        axisLabel: { formatter: (v: number) => formatPercent(v), color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        name: "暗盘资金",
        axisLabel: { formatter: (v: number) => formatCapital(v), color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: 10,
          data: analytics.scatter.map((point) => ({
            value: [point.changeRatio, point.darkCapital],
            stockName: point.name,
            stockCode: point.code,
            changeRatio: point.changeRatio,
            darkCapital: point.darkCapital,
          })),
          itemStyle: { color: "#FF5500", opacity: 0.75 },
        },
      ],
    };

    const quadrantOption = buildQuadrantOption(behavior);
    const quintileOption = buildQuintileOption(behavior);
    const pumpDumpOption = buildPumpDumpOption(behavior);

    return {
      topDarkOption,
      changeOption,
      structureOption,
      scatterOption,
      quadrantOption,
      quintileOption,
      pumpDumpOption,
    };
  }, [analytics, behavior]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-500">
        分析数据加载中...
      </div>
    );
  }

  if (!analytics || !behavior || !charts) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-500">
        {emptyMessage ?? `${tradeDateLabel} 暂无分析数据`}
      </div>
    );
  }

  const { summary } = analytics;
  const { snapshot, flowImpact, intraday: intradayStats } = behavior;

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        {tradeDateLabel} 个股截面分析 · 样本 {summary.total} 只 ·
        数据为模型估算，仅供参考
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">市场总览</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="暗盘资金合计"
            help={METRIC_HELP.darkTotal}
            value={formatCapital(summary.darkTotal)}
            sub={`占总量 ${formatPercent(summary.darkShare)}`}
            accent="text-[#3b82f6]"
          />
          <StatCard
            label="明盘资金合计"
            help={METRIC_HELP.openTotal}
            value={formatCapital(summary.openTotal)}
            accent="text-[#FF5500]"
          />
          <StatCard
            label="上涨 / 下跌"
            help={METRIC_HELP.upDown}
            value={`${summary.upCount} / ${summary.downCount}`}
            sub={`均涨幅 ${formatPercent(summary.avgChange)}`}
            accent="text-rise"
          />
          <StatCard
            label="价暗同向"
            help={METRIC_HELP.priceDarkAlign}
            value={`${summary.strongDarkInflow} 只`}
            sub={`平均暗盘活跃度 ${formatPercent(summary.avgDarkActivity)}`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">异动监测</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="快速拉升"
            help={METRIC_HELP.rapidPump}
            value={`${snapshot.pumpCount} 只`}
            sub={`暗盘主导 ${snapshot.darkLedPump} · 明盘主导 ${snapshot.openLedPump}`}
            accent="text-rise"
          />
          <StatCard
            label="快速砸盘"
            help={METRIC_HELP.rapidDump}
            value={`${snapshot.dumpCount} 只`}
            sub={`暗盘主导 ${snapshot.darkLedDump} · 明盘主导 ${snapshot.openLedDump}`}
            accent="text-fall"
          />
          <StatCard
            label="价涨暗流出"
            help={METRIC_HELP.divergenceUp}
            value={`${snapshot.divergenceUp} 只`}
            sub="拉升但暗盘净流出，需警惕背离"
            accent="text-amber-400"
          />
          <StatCard
            label="轮次间急拉/急砸"
            help={METRIC_HELP.intradayMove}
            value={
              intradayStats
                ? `${intradayStats.rapidPumpCount} / ${intradayStats.rapidDumpCount}`
                : "—"
            }
            sub={
              intradayStats
                ? `基于 ${intradayStats.iterationCount} 轮采样`
                : "需至少 2 轮 Worker 数据"
            }
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title="异动结构"
            help={METRIC_HELP.anomalyStructure}
            subtitle="拉升/砸盘及资金主导归因"
            option={charts.pumpDumpOption}
            height={260}
          />
          <CaseTable
            title="快速拉升 TOP8"
            help={METRIC_HELP.topPumpCases}
            cases={snapshot.topPumpCases.map((item) => ({
              stockName: item.stockName,
              stockCode: item.stockCode,
              tag: item.tag,
              value: item.changeRatio,
            }))}
            valueLabel="涨幅"
            valueFormat={formatPercent}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <CaseTable
            title="快速砸盘 TOP8"
            help={METRIC_HELP.topDumpCases}
            cases={snapshot.topDumpCases.map((item) => ({
              stockName: item.stockName,
              stockCode: item.stockCode,
              tag: item.tag,
              value: item.changeRatio,
            }))}
            valueLabel="涨幅"
            valueFormat={formatPercent}
          />
          {intradayStats && (
            <CaseTable
              title="轮次间急拉 TOP8"
              help={METRIC_HELP.topIntradayPump}
              cases={intradayStats.topIntradayPump.map((item) => ({
                stockName: item.stockName,
                stockCode: item.stockCode,
                tag: "轮次间",
                value: item.moveRatio,
              }))}
              valueLabel="阶段涨幅"
              valueFormat={formatPercent}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">暗盘 / 明盘对股价影响</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="暗盘-涨幅相关系数"
            help={METRIC_HELP.darkCorrelation}
            value={formatCorrelation(flowImpact.darkPriceCorrelation)}
            sub={correlationHint(flowImpact.darkPriceCorrelation, "暗盘")}
          />
          <StatCard
            label="明盘-涨幅相关系数"
            help={METRIC_HELP.openCorrelation}
            value={formatCorrelation(flowImpact.openPriceCorrelation)}
            sub={correlationHint(flowImpact.openPriceCorrelation, "明盘")}
          />
          <StatCard
            label="暗盘主导组均涨幅"
            help={METRIC_HELP.darkLedAvgChange}
            value={formatPercent(flowImpact.darkLedAvgChange)}
            sub="暗盘占比 ≥55% 的标的"
            accent="text-[#3b82f6]"
          />
          <StatCard
            label="明盘主导组均涨幅"
            help={METRIC_HELP.openLedAvgChange}
            value={formatPercent(flowImpact.openLedAvgChange)}
            sub="暗盘占比 ≤45% 的标的"
            accent="text-[#FF5500]"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title="价流四象限"
            help={METRIC_HELP.flowQuadrant}
            subtitle="各象限样本数与平均涨幅"
            option={charts.quadrantOption}
          />
          <ChartPanel
            title="暗盘强度分位 → 平均涨幅"
            help={METRIC_HELP.darkQuintile}
            subtitle="检验暗盘资金越强、涨幅是否系统性更高"
            option={charts.quintileOption}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">榜单与结构</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title="暗盘资金 TOP10"
            help={METRIC_HELP.topDarkChart}
            option={charts.topDarkOption}
          />
          <ChartPanel
            title="涨跌幅分布"
            help={METRIC_HELP.changeDistribution}
            option={charts.changeOption}
          />
          <ChartPanel
            title="暗盘 / 明盘资金结构"
            help={METRIC_HELP.capitalStructure}
            option={charts.structureOption}
          />
          <ChartPanel
            title="涨幅 × 暗盘资金（TOP60 散点）"
            help={METRIC_HELP.scatterTop60}
            option={charts.scatterOption}
          />
        </div>
      </section>
    </div>
  );
}

function correlationHint(value: number, label: string): string {
  const abs = Math.abs(value);
  if (abs >= 0.6) return `${label}与涨幅显著同向`;
  if (abs >= 0.3) return `${label}与涨幅中度相关`;
  if (abs >= 0.1) return `${label}与涨幅弱相关`;
  return `${label}与涨幅相关性较弱`;
}

function buildQuadrantOption(behavior: MarketBehaviorAnalytics): EChartsOption {
  return {
    ...chartBase,
    tooltip: { trigger: "axis" },
    legend: { data: ["样本数", "均涨幅"], textStyle: { color: "#a1a1aa" }, top: 0 },
    grid: { left: 48, right: 48, top: 36, bottom: 28 },
    xAxis: {
      type: "category",
      data: behavior.flowImpact.quadrants.map((q) => q.label),
      axisLabel: { color: "#71717a" },
    },
    yAxis: [
      {
        type: "value",
        name: "家数",
        axisLabel: { color: "#71717a" },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      {
        type: "value",
        name: "均涨幅",
        axisLabel: {
          color: "#a1a1aa",
          formatter: (v: number) => formatPercent(v),
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "样本数",
        type: "bar",
        data: behavior.flowImpact.quadrants.map((q) => q.count),
        itemStyle: { color: "#52525b" },
      },
      {
        name: "均涨幅",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: behavior.flowImpact.quadrants.map((q) => q.avgChange),
        itemStyle: { color: "#FF5500" },
      },
    ],
  };
}

function buildQuintileOption(behavior: MarketBehaviorAnalytics): EChartsOption {
  return {
    ...chartBase,
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: {
      type: "category",
      data: behavior.flowImpact.darkQuintiles.map((q) => q.label),
      axisLabel: { color: "#71717a" },
    },
    yAxis: {
      type: "value",
      name: "均涨幅",
      axisLabel: { formatter: (v: number) => formatPercent(v), color: "#71717a" },
      splitLine: { lineStyle: { color: "#27272a" } },
    },
    series: [
      {
        type: "bar",
        data: behavior.flowImpact.darkQuintiles.map((q) => ({
          value: q.avgChange,
          itemStyle: { color: q.avgChange >= 0 ? "#ef4444" : "#22c55e" },
        })),
      },
    ],
  };
}

function buildPumpDumpOption(behavior: MarketBehaviorAnalytics): EChartsOption {
  const { snapshot } = behavior;
  const labels = [
    "价涨暗流出",
    "暗盘推升",
    "明盘推升",
    "快速拉升",
    "暗盘砸盘",
    "明盘砸盘",
    "快速砸盘",
  ];
  const values = [
    snapshot.divergenceUp,
    snapshot.darkLedPump,
    snapshot.openLedPump,
    snapshot.pumpCount,
    snapshot.darkLedDump,
    snapshot.openLedDump,
    snapshot.dumpCount,
  ];
  const colors = [
    "#f59e0b",
    "#ef4444",
    "#ef4444",
    "#ef4444",
    "#22c55e",
    "#22c55e",
    "#22c55e",
  ];

  return {
    ...chartBase,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 88, right: 16, top: 12, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#71717a" },
      splitLine: { lineStyle: { color: "#27272a" } },
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: "#d4d4d8", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: values.map((value, index) => ({
          value,
          itemStyle: { color: colors[index] ?? "#71717a" },
        })),
      },
    ],
  };
}
