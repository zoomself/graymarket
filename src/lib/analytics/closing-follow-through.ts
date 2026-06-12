import type { ClosingMoveRow, ClosingSignalType } from "@/lib/analytics/closing-move";

/** 单日涨跌幅超过此值视为极端波动（多为新股），散点图等可视化中排除 */
export const EXTREME_CHANGE_THRESHOLD = 0.5;

export function isExtremeDailyChange(changeRatio: number): boolean {
  return Math.abs(changeRatio) > EXTREME_CHANGE_THRESHOLD;
}

export function filterRowsForScatter(rows: ClosingFollowThroughRow[]): ClosingFollowThroughRow[] {
  return rows.filter(
    (row) =>
      !isExtremeDailyChange(row.prevChange) && !isExtremeDailyChange(row.todayChange),
  );
}

export interface TodaySnapshotRow {
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  changeRatio: number;
  darkCapital: number;
}

export interface ClosingFollowThroughRow {
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  signalType: ClosingSignalType;
  prevTags: string[];
  prevChange: number;
  prevDarkDelta: number;
  prevDarkCapital: number;
  prevScore: number;
  todayChange: number;
  todayDarkCapital: number;
  darkDeltaOvernight: number;
  tags: string[];
}

export interface ClosingFollowThroughSummary {
  signalCount: number;
  matchedCount: number;
  todayUpCount: number;
  todayUpRatio: number;
  avgTodayChange: number;
  marketAvgChange: number;
  avgAlpha: number;
  strongContinueCount: number;
  fadeCount: number;
}

export interface ClosingFollowThroughResult {
  prevDate: string;
  todayDate: string;
  prevDateLabel: string;
  todayDateLabel: string;
  summary: ClosingFollowThroughSummary;
  rows: ClosingFollowThroughRow[];
  insights: string[];
  message?: string;
}

function formatDateLabel(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function buildFollowTags(
  prev: ClosingMoveRow,
  todayChange: number,
  darkDeltaOvernight: number,
): string[] {
  const tags: string[] = [];

  if (todayChange >= 0.05) {
    tags.push("隔日大涨");
  } else if (todayChange >= 0.02) {
    tags.push("延续强势");
  } else if (todayChange > 0) {
    tags.push("小幅续涨");
  } else if (todayChange <= -0.05) {
    tags.push("大幅回调");
  } else if (todayChange <= -0.02) {
    tags.push("隔日兑现");
  } else if (todayChange < 0) {
    tags.push("小幅走弱");
  } else {
    tags.push("横盘");
  }

  if (prev.changeRatio >= 0.03 && todayChange <= -0.02) {
    tags.push("冲高回落");
  }

  if (darkDeltaOvernight >= 2_000_000 && todayChange > 0) {
    tags.push("暗盘接力");
  } else if (darkDeltaOvernight <= -2_000_000 && todayChange < 0) {
    tags.push("暗盘撤离");
  }

  if (prev.signalType === "both" && todayChange >= 0.03) {
    tags.push("双双验证");
  }

  return tags;
}

function emptySummary(): ClosingFollowThroughSummary {
  return {
    signalCount: 0,
    matchedCount: 0,
    todayUpCount: 0,
    todayUpRatio: 0,
    avgTodayChange: 0,
    marketAvgChange: 0,
    avgAlpha: 0,
    strongContinueCount: 0,
    fadeCount: 0,
  };
}

function buildInsights(
  summary: ClosingFollowThroughSummary,
  prevDateLabel: string,
  todayDateLabel: string,
): string[] {
  const insights: string[] = [];

  if (summary.signalCount === 0) {
    return [`${prevDateLabel} 无符合条件的尾盘异动信号`];
  }

  insights.push(
    `${prevDateLabel} 尾盘异动 ${summary.signalCount} 只，${todayDateLabel} 上涨 ${summary.todayUpCount} 只（${Math.round(summary.todayUpRatio * 100)}%），均涨 ${(summary.avgTodayChange * 100).toFixed(2)}%`,
  );

  if (summary.marketAvgChange !== 0) {
    const alphaPct = summary.avgAlpha * 100;
    if (alphaPct > 0.3) {
      insights.push(
        `异动股今日平均跑赢大盘 ${alphaPct.toFixed(2)} 个百分点，隔日溢价仍在`,
      );
    } else if (alphaPct < -0.3) {
      insights.push(
        `异动股今日平均落后大盘 ${Math.abs(alphaPct).toFixed(2)} 个百分点，注意隔日兑现`,
      );
    }
  }

  if (summary.strongContinueCount >= 3) {
    insights.push(`${summary.strongContinueCount} 只隔日涨幅超 5%，强势延续明显`);
  }

  if (summary.fadeCount >= 3) {
    insights.push(`${summary.fadeCount} 只隔日跌幅超 2%，需警惕一日游行情`);
  }

  return insights;
}

export function computeClosingFollowThrough(
  prevDate: string,
  todayDate: string,
  closingRows: ClosingMoveRow[],
  todaySnapshots: TodaySnapshotRow[],
): ClosingFollowThroughResult {
  const prevDateLabel = formatDateLabel(prevDate);
  const todayDateLabel = formatDateLabel(todayDate);

  if (closingRows.length === 0) {
    return {
      prevDate,
      todayDate,
      prevDateLabel,
      todayDateLabel,
      summary: emptySummary(),
      rows: [],
      insights: [`${prevDateLabel} 无符合条件的尾盘异动`],
      message: `${prevDateLabel} 无符合条件的尾盘异动`,
    };
  }

  const todayByCode = new Map(todaySnapshots.map((row) => [row.stockCode, row]));
  const marketAvgChange =
    todaySnapshots.length > 0
      ? todaySnapshots.reduce((sum, row) => sum + row.changeRatio, 0) /
        todaySnapshots.length
      : 0;

  const rows: ClosingFollowThroughRow[] = [];

  for (const prev of closingRows) {
    const today = todayByCode.get(prev.stockCode);
    if (!today) continue;

    const darkDeltaOvernight = today.darkCapital - prev.darkCapital;

    rows.push({
      stockCode: prev.stockCode,
      stockName: prev.stockName,
      industry: today.industry,
      concept: today.concept,
      signalType: prev.signalType,
      prevTags: prev.tags,
      prevChange: prev.changeRatio,
      prevDarkDelta: prev.darkDelta,
      prevDarkCapital: prev.darkCapital,
      prevScore: prev.score,
      todayChange: today.changeRatio,
      todayDarkCapital: today.darkCapital,
      darkDeltaOvernight,
      tags: buildFollowTags(prev, today.changeRatio, darkDeltaOvernight),
    });
  }

  rows.sort(
    (a, b) =>
      b.todayChange - a.todayChange ||
      b.prevScore - a.prevScore ||
      b.prevDarkDelta - a.prevDarkDelta,
  );

  const matchedCount = rows.length;
  const todayUpCount = rows.filter((row) => row.todayChange > 0).length;
  const avgTodayChange =
    matchedCount > 0
      ? rows.reduce((sum, row) => sum + row.todayChange, 0) / matchedCount
      : 0;

  const summary: ClosingFollowThroughSummary = {
    signalCount: closingRows.length,
    matchedCount,
    todayUpCount,
    todayUpRatio: matchedCount > 0 ? todayUpCount / matchedCount : 0,
    avgTodayChange,
    marketAvgChange,
    avgAlpha: avgTodayChange - marketAvgChange,
    strongContinueCount: rows.filter((row) => row.todayChange >= 0.05).length,
    fadeCount: rows.filter((row) => row.todayChange <= -0.02).length,
  };

  return {
    prevDate,
    todayDate,
    prevDateLabel,
    todayDateLabel,
    summary,
    rows,
    insights: buildInsights(summary, prevDateLabel, todayDateLabel),
    message:
      matchedCount === 0
        ? `${todayDateLabel} 暂无匹配行情数据`
        : undefined,
  };
}
