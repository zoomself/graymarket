import { sectorTagsForRow } from "@/lib/analytics/sector-tags";
import type { ClosingFollowThroughResult } from "@/lib/analytics/closing-follow-through";

export type RotationGroupBy = "industry" | "concept";

export interface StockDayRow {
  industry: string;
  concept: string;
  changeRatio: number;
  darkCapital: number;
}

export interface SectorDayStat {
  sector: string;
  date: string;
  avgChange: number;
  stockCount: number;
  upRatio: number;
  darkTotal: number;
}

export interface SectorRotationRow {
  sector: string;
  latestRank: number;
  prevRank: number;
  rankChange: number;
  latestChange: number;
  prevChange: number;
  streakTop10: number;
  darkFlowDelta: number;
  tags: string[];
}

export interface DailyLeaderEntry {
  date: string;
  label: string;
  top: Array<{ sector: string; avgChange: number; stockCount: number }>;
}

export interface RotationReviewResult {
  endDate: string;
  dates: string[];
  groupBy: RotationGroupBy;
  rotationIndex: number;
  continuationRate: number;
  latestDate: string;
  prevDate: string | null;
  sectorRows: SectorRotationRow[];
  dailyLeaders: DailyLeaderEntry[];
  heatmap: {
    sectors: string[];
    dates: string[];
    values: number[][];
  };
  trendSeries: Array<{
    sector: string;
    points: Array<{ date: string; avgChange: number }>;
  }>;
  insights: string[];
  closingFollowThrough: ClosingFollowThroughResult | null;
  message?: string;
}

function aggregateDay(
  date: string,
  rows: StockDayRow[],
  groupBy: RotationGroupBy,
): Map<string, SectorDayStat> {
  const buckets = new Map<
    string,
    { changeSum: number; up: number; count: number; dark: number }
  >();

  for (const row of rows) {
    const tags = sectorTagsForRow(row.industry, row.concept, groupBy);
    for (const sector of tags) {
      const bucket = buckets.get(sector) ?? {
        changeSum: 0,
        up: 0,
        count: 0,
        dark: 0,
      };
      bucket.changeSum += row.changeRatio;
      bucket.up += row.changeRatio > 0 ? 1 : 0;
      bucket.count += 1;
      bucket.dark += row.darkCapital;
      buckets.set(sector, bucket);
    }
  }

  const stats = new Map<string, SectorDayStat>();
  for (const [sector, bucket] of buckets) {
    if (bucket.count < 3) continue;
    stats.set(sector, {
      sector,
      date,
      avgChange: bucket.changeSum / bucket.count,
      stockCount: bucket.count,
      upRatio: bucket.up / bucket.count,
      darkTotal: bucket.dark,
    });
  }
  return stats;
}

function rankSectors(stats: Map<string, SectorDayStat>): Map<string, number> {
  const sorted = [...stats.values()].sort((a, b) => b.avgChange - a.avgChange);
  const ranks = new Map<string, number>();
  sorted.forEach((item, index) => ranks.set(item.sector, index + 1));
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const n = xs.length;

  const rank = (values: number[]) => {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(n);
    for (let i = 0; i < indexed.length; i += 1) {
      ranks[indexed[i].i] = i + 1;
    }
    return ranks;
  };

  const rx = rank(xs);
  const ry = rank(ys);
  const meanX = rx.reduce((a, b) => a + b, 0) / n;
  const meanY = ry.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = rx[i] - meanX;
    const dy = ry[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function computeRotationIndex(
  dayStats: Map<string, Map<string, SectorDayStat>>,
  dates: string[],
): number {
  const correlations: number[] = [];

  for (let i = 1; i < dates.length; i += 1) {
    const prev = dayStats.get(dates[i - 1]);
    const curr = dayStats.get(dates[i]);
    if (!prev || !curr) continue;

    const shared = [...curr.keys()].filter((k) => prev.has(k));
    if (shared.length < 5) continue;

    const prevRanks = shared.map((k) => prev.get(k)!.avgChange);
    const currRanks = shared.map((k) => curr.get(k)!.avgChange);
    correlations.push(spearman(prevRanks, currRanks));
  }

  if (correlations.length === 0) return 0;
  return correlations.reduce((a, b) => a + b, 0) / correlations.length;
}

function computeContinuationRate(
  dayStats: Map<string, Map<string, SectorDayStat>>,
  dates: string[],
): number {
  if (dates.length < 2) return 0;
  const prevDate = dates[dates.length - 2];
  const latestDate = dates[dates.length - 1];
  const prev = dayStats.get(prevDate);
  const latest = dayStats.get(latestDate);
  if (!prev || !latest) return 0;

  const prevTop5 = [...prev.values()]
    .sort((a, b) => b.avgChange - a.avgChange)
    .slice(0, 5)
    .map((s) => s.sector);
  const latestTop10 = new Set(
    [...latest.values()]
      .sort((a, b) => b.avgChange - a.avgChange)
      .slice(0, 10)
      .map((s) => s.sector),
  );

  const kept = prevTop5.filter((s) => latestTop10.has(s)).length;
  return kept / prevTop5.length;
}

function streakTop10(
  sector: string,
  dayStats: Map<string, Map<string, SectorDayStat>>,
  dates: string[],
): number {
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const stats = dayStats.get(dates[i]);
    if (!stats?.has(sector)) break;
    const ranks = rankSectors(stats);
    if ((ranks.get(sector) ?? 999) <= 10) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function buildTags(row: Omit<SectorRotationRow, "tags">): string[] {
  const tags: string[] = [];

  if (row.streakTop10 >= 2) tags.push("持续强势");
  if (row.rankChange >= 15) tags.push("轮动上位");
  if (row.rankChange <= -15) tags.push("降温回调");
  if (row.latestChange > 0 && row.prevChange <= 0) tags.push("由弱转强");
  if (row.darkFlowDelta > 0 && row.latestChange > 0) tags.push("暗盘接力");
  if (row.latestRank <= 5 && row.prevRank > 10) tags.push("新热点");

  return tags;
}

function buildInsights(
  result: Pick<
    RotationReviewResult,
    "rotationIndex" | "continuationRate" | "sectorRows" | "dailyLeaders" | "groupBy"
  >,
): string[] {
  const insights: string[] = [];
  const groupLabel = result.groupBy === "industry" ? "行业" : "概念";

  if (result.rotationIndex < 0.15) {
    insights.push(`${groupLabel}轮动较快：相邻交易日涨幅排名相关性较低，热点切换频繁。`);
  } else if (result.rotationIndex > 0.45) {
    insights.push(`${groupLabel}持续性偏强：热点有一定延续，昨日强势板块今日仍可能靠前。`);
  } else {
    insights.push(`${groupLabel}轮动适中：既有延续也有切换，可结合「持续强势」与「轮动上位」标签筛选。`);
  }

  if (result.continuationRate >= 0.6) {
    insights.push(
      `昨日 TOP5 中有 ${Math.round(result.continuationRate * 100)}% 仍留在今日 TOP10，短线可关注延续。`,
    );
  } else if (result.continuationRate <= 0.2) {
    insights.push(
      `昨日 TOP5 延续率仅 ${Math.round(result.continuationRate * 100)}%，更适合挖掘新轮动方向。`,
    );
  }

  const rotators = result.sectorRows.filter((r) => r.tags.includes("轮动上位")).slice(0, 3);
  if (rotators.length > 0) {
    insights.push(`近期轮动上位：${rotators.map((r) => r.sector).join("、")}。`);
  }

  const latest = result.dailyLeaders.at(-1);
  if (latest?.top[0]) {
    insights.push(
      `最新一日（${latest.label}）最强${groupLabel}：${latest.top[0].sector}（均涨幅 ${(latest.top[0].avgChange * 100).toFixed(2)}%）。`,
    );
  }

  return insights;
}

export function computeRotationReview(
  endDate: string,
  dates: string[],
  snapshotsByDate: Map<string, StockDayRow[]>,
  groupBy: RotationGroupBy,
): RotationReviewResult {
  if (dates.length < 2) {
    return {
      endDate,
      dates,
      groupBy,
      rotationIndex: 0,
      continuationRate: 0,
      latestDate: dates[0] ?? endDate,
      prevDate: null,
      sectorRows: [],
      dailyLeaders: [],
      heatmap: { sectors: [], dates: [], values: [] },
      trendSeries: [],
      insights: [],
      closingFollowThrough: null,
      message: "至少需要 2 个有数据的交易日才能复盘轮动",
    };
  }

  const dayStats = new Map<string, Map<string, SectorDayStat>>();
  for (const date of dates) {
    const rows = snapshotsByDate.get(date) ?? [];
    dayStats.set(date, aggregateDay(date, rows, groupBy));
  }

  const rotationIndex = computeRotationIndex(dayStats, dates);
  const continuationRate = computeContinuationRate(dayStats, dates);
  const latestDate = dates[dates.length - 1];
  const prevDate = dates[dates.length - 2] ?? null;

  const latestStats = dayStats.get(latestDate)!;
  const prevStats = prevDate ? dayStats.get(prevDate)! : new Map();
  const latestRanks = rankSectors(latestStats);
  const prevRanks = rankSectors(prevStats);

  const allSectors = new Set<string>();
  for (const stats of dayStats.values()) {
    for (const sector of stats.keys()) allSectors.add(sector);
  }

  const sectorRows: SectorRotationRow[] = [...allSectors].map((sector) => {
    const latest = latestStats.get(sector);
    const prev = prevStats.get(sector);
    const latestRank = latestRanks.get(sector) ?? 999;
    const prevRank = prevRanks.get(sector) ?? 999;
    const darkLatest = latest?.darkTotal ?? 0;
    const darkPrev = prev?.darkTotal ?? 0;

    const base = {
      sector,
      latestRank,
      prevRank,
      rankChange: prevRank - latestRank,
      latestChange: latest?.avgChange ?? 0,
      prevChange: prev?.avgChange ?? 0,
      streakTop10: streakTop10(sector, dayStats, dates),
      darkFlowDelta: darkLatest - darkPrev,
    };

    return {
      ...base,
      tags: buildTags(base),
    };
  });

  sectorRows.sort((a, b) => {
    if (a.latestRank !== b.latestRank) return a.latestRank - b.latestRank;
    return b.rankChange - a.rankChange;
  });

  const dailyLeaders: DailyLeaderEntry[] = dates.map((date) => {
    const stats = dayStats.get(date) ?? new Map();
    const top = [...stats.values()]
      .sort((a, b) => b.avgChange - a.avgChange)
      .slice(0, 5)
      .map((s) => ({
        sector: s.sector,
        avgChange: s.avgChange,
        stockCount: s.stockCount,
      }));
    return {
      date,
      label: formatDateLabel(date),
      top,
    };
  });

  const sectorScores = new Map<string, number>();
  for (const sector of allSectors) {
    let score = 0;
    for (const date of dates) {
      const rank = rankSectors(dayStats.get(date) ?? new Map()).get(sector);
      if (rank && rank <= 15) score += 16 - rank;
    }
    sectorScores.set(sector, score);
  }

  const heatmapSectors = [...sectorScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([sector]) => sector);

  const heatmapValues = heatmapSectors.map((sector) =>
    dates.map((date) => {
      const stat = dayStats.get(date)?.get(sector);
      return stat ? Number((stat.avgChange * 100).toFixed(2)) : 0;
    }),
  );

  const trendSeries = heatmapSectors.slice(0, 6).map((sector) => ({
    sector,
    points: dates.map((date) => ({
      date: formatDateLabel(date),
      avgChange: dayStats.get(date)?.get(sector)?.avgChange ?? 0,
    })),
  }));

  const result: RotationReviewResult = {
    endDate,
    dates,
    groupBy,
    rotationIndex,
    continuationRate,
    latestDate,
    prevDate,
    sectorRows,
    dailyLeaders,
    heatmap: {
      sectors: heatmapSectors,
      dates: dates.map(formatDateLabel),
      values: heatmapValues,
    },
    trendSeries,
    insights: [],
    closingFollowThrough: null,
  };

  result.insights = buildInsights(result);
  return result;
}

function formatDateLabel(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function formatRotationIndex(value: number): string {
  return value.toFixed(2);
}
