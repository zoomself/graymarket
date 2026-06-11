import type { TableSnapshot } from "@/components/DarkTradeTable";

export interface OverviewSummary {
  total: number;
  darkTotal: number;
  openTotal: number;
  darkShare: number;
  avgChange: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  avgDarkActivity: number;
  strongDarkInflow: number;
}

export interface NamedValue {
  name: string;
  code: string;
  value: number;
}

export interface ChangeBucket {
  label: string;
  count: number;
}

export interface OverviewAnalytics {
  summary: OverviewSummary;
  topDark: NamedValue[];
  topOpen: NamedValue[];
  topActivity: NamedValue[];
  changeBuckets: ChangeBucket[];
  scatter: Array<{
    name: string;
    code: string;
    changeRatio: number;
    darkCapital: number;
  }>;
}

function topN(
  rows: TableSnapshot[],
  pick: (row: TableSnapshot) => number,
  n: number,
): NamedValue[] {
  return [...rows]
    .sort((a, b) => pick(b) - pick(a))
    .slice(0, n)
    .map((row) => ({
      name: row.stockName,
      code: row.stockCode,
      value: pick(row),
    }));
}

function buildChangeBuckets(rows: TableSnapshot[]): ChangeBucket[] {
  const buckets = [
    { label: "≤-5%", min: -Infinity, max: -0.05 },
    { label: "-5~0%", min: -0.05, max: 0 },
    { label: "0~5%", min: 0, max: 0.05 },
    { label: "≥5%", min: 0.05, max: Infinity },
  ];

  return buckets.map(({ label, min, max }) => ({
    label,
    count: rows.filter((row) => row.changeRatio > min && row.changeRatio <= max).length,
  }));
}

export function computeOverviewAnalytics(rows: TableSnapshot[]): OverviewAnalytics | null {
  if (rows.length === 0) return null;

  const darkTotal = rows.reduce((sum, row) => sum + row.darkCapital, 0);
  const openTotal = rows.reduce((sum, row) => sum + row.openCapital, 0);
  const denom = Math.abs(darkTotal) + Math.abs(openTotal);

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  for (const row of rows) {
    if (row.changeRatio > 0.001) upCount += 1;
    else if (row.changeRatio < -0.001) downCount += 1;
    else flatCount += 1;
  }

  const summary: OverviewSummary = {
    total: rows.length,
    darkTotal,
    openTotal,
    darkShare: denom === 0 ? 0 : Math.abs(darkTotal) / denom,
    avgChange: rows.reduce((sum, row) => sum + row.changeRatio, 0) / rows.length,
    upCount,
    downCount,
    flatCount,
    avgDarkActivity: rows.reduce((sum, row) => sum + row.darkActivity, 0) / rows.length,
    strongDarkInflow: rows.filter((row) => row.darkCapital > 0 && row.changeRatio > 0).length,
  };

  return {
    summary,
    topDark: topN(rows, (row) => row.darkCapital, 10),
    topOpen: topN(rows, (row) => row.openCapital, 10),
    topActivity: topN(rows, (row) => row.darkActivity, 8),
    changeBuckets: buildChangeBuckets(rows),
    scatter: [...rows]
      .sort((a, b) => b.darkCapital - a.darkCapital)
      .slice(0, 60)
      .map((row) => ({
        name: row.stockName,
        code: row.stockCode,
        changeRatio: row.changeRatio,
        darkCapital: row.darkCapital,
      })),
  };
}
