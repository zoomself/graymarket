import {
  DEFAULT_CLOSING_THRESHOLDS,
  type ClosingThresholds,
} from "@/lib/analytics/closing-thresholds";

/** Afternoon session open 13:00 Shanghai */
const AFTERNOON_OPEN_MINUTES = 13 * 60;

export type ClosingSignalType = "both" | "dark";

export interface IterationMeta {
  id: string;
  iterationNo: number;
  completedAt: string | null;
}

export interface SnapshotCapitalRow {
  stockCode: string;
  stockName: string;
  darkCapital: number;
  openCapital: number;
  priceRaw: number;
  changeRatio: number;
  darkActivity: number;
  rankNo: number;
}

export interface ClosingMoveRow extends SnapshotCapitalRow {
  signalType: ClosingSignalType;
  baselineDark: number;
  baselineOpen: number;
  morningDark: number | null;
  morningOpen: number | null;
  darkDelta: number;
  openDelta: number;
  score: number;
  tags: string[];
}

export interface ClosingMoveResult {
  baselineIterationNo: number;
  latestIterationNo: number;
  morningIterationNo: number | null;
  baselineTime: string | null;
  latestTime: string | null;
  iterationCount: number;
  thresholds: ClosingThresholds;
  rows: ClosingMoveRow[];
}

function shanghaiMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function pickClosingCompareIterations(
  iterations: IterationMeta[],
): {
  morning: IterationMeta | null;
  baseline: IterationMeta;
  latest: IterationMeta;
} | null {
  if (iterations.length < 2) return null;

  const latest = iterations[iterations.length - 1];
  let morning: IterationMeta | null = null;
  let baselineIdx = -1;

  for (let i = 0; i < iterations.length; i += 1) {
    const mins = shanghaiMinutes(iterations[i].completedAt);
    if (mins === null) continue;

    if (mins < AFTERNOON_OPEN_MINUTES) {
      morning = iterations[i];
    }

    if (mins >= AFTERNOON_OPEN_MINUTES && baselineIdx < 0) {
      baselineIdx = i;
    }
  }

  if (baselineIdx < 0) return null;

  const baseline = iterations[baselineIdx];
  if (baseline.iterationNo >= latest.iterationNo) return null;

  return { morning, baseline, latest };
}

function isBothStrong(
  baselineDark: number,
  baselineOpen: number,
  latestDark: number,
  latestOpen: number,
  darkDelta: number,
  openDelta: number,
  thresholds: ClosingThresholds,
): boolean {
  return (
    darkDelta >= thresholds.minDarkDelta &&
    openDelta >= thresholds.minOpenDelta &&
    latestDark > baselineDark &&
    latestOpen > baselineOpen &&
    darkDelta > 0 &&
    openDelta > 0
  );
}

function isDarkStrong(
  baselineDark: number,
  latestDark: number,
  darkDelta: number,
  thresholds: ClosingThresholds,
): boolean {
  return (
    darkDelta >= thresholds.minDarkDelta &&
    latestDark > baselineDark &&
    darkDelta > 0
  );
}

function buildBothTags(
  baselineDark: number,
  baselineOpen: number,
  latestDark: number,
  latestOpen: number,
  morningDark: number | null,
  morningOpen: number | null,
): string[] {
  const tags = ["双双走强"];

  if (baselineDark < 0 && latestDark > 0 && baselineOpen < 0 && latestOpen > 0) {
    tags.push("双双由负转正");
  } else {
    if (baselineDark < 0 && latestDark > 0) tags.push("暗盘由负转正");
    if (baselineOpen < 0 && latestOpen > 0) tags.push("明盘由负转正");
  }

  if (
    morningDark !== null &&
    morningOpen !== null &&
    morningDark < 0 &&
    morningOpen < 0 &&
    latestDark > 0 &&
    latestOpen > 0
  ) {
    tags.push("早盘V形");
  } else if (morningDark !== null && morningDark < 0 && latestDark > 0) {
    tags.push("暗盘V形");
  }

  return tags;
}

function buildDarkTags(
  baselineDark: number,
  latestDark: number,
  morningDark: number | null,
): string[] {
  const tags = ["暗盘走强"];

  if (baselineDark < 0 && latestDark > 0) {
    tags.push("暗盘由负转正");
  }

  if (morningDark !== null && morningDark < 0 && latestDark > 0) {
    tags.push("早盘V形");
  }

  return tags;
}

function computeScore(
  signalType: ClosingSignalType,
  darkDelta: number,
  openDelta: number,
  tags: string[],
): number {
  let score = signalType === "both" ? 500 : 300;

  if (tags.includes("双双由负转正")) score += 800;
  else if (tags.includes("暗盘由负转正")) score += 500;

  if (tags.includes("早盘V形")) score += 400;
  else if (tags.includes("暗盘V形")) score += 250;

  if (tags.includes("明盘由负转正")) score += 200;

  score += Math.min(400, darkDelta / 2_500_000);
  if (signalType === "both") {
    score += Math.min(300, openDelta / 2_500_000);
  }

  return Math.round(score * 10) / 10;
}

export function computeClosingMoves(
  baselineRows: SnapshotCapitalRow[],
  latestRows: SnapshotCapitalRow[],
  morningRows: SnapshotCapitalRow[] | null,
  meta: {
    baselineIterationNo: number;
    latestIterationNo: number;
    morningIterationNo: number | null;
    baselineTime: string | null;
    latestTime: string | null;
    iterationCount: number;
  },
  thresholds: ClosingThresholds = DEFAULT_CLOSING_THRESHOLDS,
): ClosingMoveResult {
  const baselineByCode = new Map(baselineRows.map((row) => [row.stockCode, row]));
  const morningByCode = morningRows
    ? new Map(morningRows.map((row) => [row.stockCode, row]))
    : null;

  const rows: ClosingMoveRow[] = [];

  for (const latest of latestRows) {
    const baseline = baselineByCode.get(latest.stockCode);
    if (!baseline) continue;

    const morning = morningByCode?.get(latest.stockCode) ?? null;
    const morningDark = morning?.darkCapital ?? null;
    const morningOpen = morning?.openCapital ?? null;

    const darkDelta = latest.darkCapital - baseline.darkCapital;
    const openDelta = latest.openCapital - baseline.openCapital;

    let signalType: ClosingSignalType | null = null;
    let tags: string[] = [];

    if (
      isBothStrong(
        baseline.darkCapital,
        baseline.openCapital,
        latest.darkCapital,
        latest.openCapital,
        darkDelta,
        openDelta,
        thresholds,
      )
    ) {
      signalType = "both";
      tags = buildBothTags(
        baseline.darkCapital,
        baseline.openCapital,
        latest.darkCapital,
        latest.openCapital,
        morningDark,
        morningOpen,
      );
    } else if (
      isDarkStrong(baseline.darkCapital, latest.darkCapital, darkDelta, thresholds)
    ) {
      signalType = "dark";
      tags = buildDarkTags(baseline.darkCapital, latest.darkCapital, morningDark);
    }

    if (!signalType) continue;

    rows.push({
      ...latest,
      signalType,
      baselineDark: baseline.darkCapital,
      baselineOpen: baseline.openCapital,
      morningDark,
      morningOpen,
      darkDelta,
      openDelta,
      tags,
      score: computeScore(signalType, darkDelta, openDelta, tags),
    });
  }

  rows.sort((a, b) => b.score - a.score || b.darkDelta - a.darkDelta);

  return {
    ...meta,
    thresholds,
    rows,
  };
}

export const CLOSING_SIGNAL_LABELS: Record<ClosingSignalType, string> = {
  both: "双双走强",
  dark: "暗盘走强",
};
