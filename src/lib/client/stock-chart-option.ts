import type { EChartsOption } from "echarts";
import { formatCapital } from "@/lib/eastmoney/client";
import type { StockHistoryPoint } from "@/lib/client/stock-history-cache";

function toPriceYuan(priceRaw: number): number {
  return priceRaw / 1000;
}

export function buildStockChartOption(points: StockHistoryPoint[]): EChartsOption {
  const labels = points.map((p) => {
    const d = new Date(p.capturedAt);
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });

  const darkData = points.map((p) => p.darkCapital);
  const openData = points.map((p) => p.openCapital);
  const priceData = points.map((p) => toPriceYuan(p.priceRaw));
  const dense = points.length > 12;
  const showSymbol = points.length <= 16;

  return {
    backgroundColor: "transparent",
    animation: points.length > 48 ? false : true,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#18181b",
      borderColor: "#3f3f46",
      textStyle: { color: "#e4e4e7", fontSize: 12 },
      formatter: (params: unknown) => {
        const items = params as Array<{
          seriesName: string;
          value: number;
          axisValue: string;
          dataIndex: number;
        }>;
        if (!items?.length) return "";
        const idx = items[0].dataIndex;
        const point = points[idx];
        let html = point
          ? `#${point.iterationNo} ${items[0].axisValue}<br/>`
          : `${items[0].axisValue}<br/>`;
        for (const item of items) {
          const val =
            item.seriesName === "股价"
              ? `${item.value.toFixed(2)}元`
              : formatCapital(item.value);
          html += `${item.seriesName}: ${val}<br/>`;
        }
        return html;
      },
    },
    legend: {
      data: ["暗盘资金", "明盘资金", "股价"],
      textStyle: { color: "#a1a1aa" },
      top: 0,
    },
    grid: {
      left: 72,
      right: 72,
      top: 48,
      bottom: dense ? 56 : 32,
    },
    dataZoom: dense
      ? [
          { type: "inside", start: Math.max(0, 100 - (24 / points.length) * 100) },
          {
            type: "slider",
            height: 18,
            bottom: 4,
            borderColor: "#3f3f46",
            fillerColor: "rgba(255, 85, 0, 0.15)",
            handleStyle: { color: "#FF5500" },
            textStyle: { color: "#71717a" },
          },
        ]
      : undefined,
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#52525b" } },
      axisLabel: {
        color: "#71717a",
        fontSize: 11,
        interval: dense ? Math.ceil(points.length / 12) - 1 : 0,
      },
    },
    yAxis: [
      {
        type: "value",
        name: "资金",
        scale: true,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#27272a" } },
        axisLabel: {
          color: "#71717a",
          formatter: (v: number) => formatCapital(v),
        },
      },
      {
        type: "value",
        name: "股价(元)",
        scale: true,
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: "#a1a1aa",
          formatter: (v: number) => v.toFixed(2),
        },
      },
    ],
    series: [
      {
        name: "暗盘资金",
        type: "line",
        yAxisIndex: 0,
        smooth: true,
        showSymbol,
        symbolSize: 6,
        data: darkData,
        lineStyle: { color: "#3b82f6", width: 2 },
        itemStyle: { color: "#3b82f6" },
        emphasis: { focus: "series" },
      },
      {
        name: "明盘资金",
        type: "line",
        yAxisIndex: 0,
        smooth: true,
        showSymbol,
        symbolSize: 6,
        data: openData,
        lineStyle: { color: "#FF5500", width: 2 },
        itemStyle: { color: "#FF5500" },
        emphasis: { focus: "series" },
      },
      {
        name: "股价",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol,
        symbolSize: 6,
        data: priceData,
        lineStyle: { color: "#e4e4e7", width: 2 },
        itemStyle: { color: "#e4e4e7" },
        emphasis: { focus: "series" },
      },
    ],
  };
}
