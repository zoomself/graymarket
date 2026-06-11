import type { TableSnapshot } from "@/components/DarkTradeTable";

const PUMP_THRESHOLD = 0.05;
const DUMP_THRESHOLD = -0.05;
const INTRADAY_MOVE_THRESHOLD = 0.025;

export interface BehaviorCase {
  stockCode: string;
  stockName: string;
  changeRatio: number;
  darkCapital: number;
  openCapital: number;
  tag: string;
}

export interface FlowQuadrant {
  label: string;
  count: number;
  avgChange: number;
}

export interface FlowQuintile {
  label: string;
  count: number;
  avgChange: number;
  avgDarkCapital: number;
}

export interface SnapshotBehavior {
  pumpCount: number;
  dumpCount: number;
  darkLedPump: number;
  openLedPump: number;
  darkLedDump: number;
  openLedDump: number;
  divergenceUp: number;
  divergenceDown: number;
  topPumpCases: BehaviorCase[];
  topDumpCases: BehaviorCase[];
}

export interface FlowImpact {
  darkPriceCorrelation: number;
  openPriceCorrelation: number;
  darkLedAvgChange: number;
  openLedAvgChange: number;
  quadrants: FlowQuadrant[];
  darkQuintiles: FlowQuintile[];
}

export interface IntradayBehavior {
  iterationCount: number;
  rapidPumpCount: number;
  rapidDumpCount: number;
  topIntradayPump: Array<{
    stockCode: string;
    stockName: string;
    moveRatio: number;
    changeRatio: number;
  }>;
  topIntradayDump: Array<{
    stockCode: string;
    stockName: string;
    moveRatio: number;
    changeRatio: number;
  }>;
}

export interface MarketBehaviorAnalytics {
  snapshot: SnapshotBehavior;
  flowImpact: FlowImpact;
  intraday: IntradayBehavior | null;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function darkShare(row: TableSnapshot): number {
  const total = Math.abs(row.darkCapital) + Math.abs(row.openCapital);
  return total === 0 ? 0 : row.darkCapital / total;
}

function buildBehaviorCase(row: TableSnapshot, tag: string): BehaviorCase {
  return {
    stockCode: row.stockCode,
    stockName: row.stockName,
    changeRatio: row.changeRatio,
    darkCapital: row.darkCapital,
    openCapital: row.openCapital,
    tag,
  };
}

function computeSnapshotBehavior(rows: TableSnapshot[]): SnapshotBehavior {
  const pumps = rows.filter((row) => row.changeRatio >= PUMP_THRESHOLD);
  const dumps = rows.filter((row) => row.changeRatio <= DUMP_THRESHOLD);

  const darkLedPump = pumps.filter(
    (row) => row.darkCapital > 0 && darkShare(row) >= 0.55,
  ).length;
  const openLedPump = pumps.filter(
    (row) => row.openCapital > 0 && darkShare(row) < 0.45,
  ).length;
  const darkLedDump = dumps.filter(
    (row) => row.darkCapital < 0 && Math.abs(row.darkCapital) >= Math.abs(row.openCapital),
  ).length;
  const openLedDump = dumps.filter(
    (row) => row.openCapital < 0 && Math.abs(row.openCapital) > Math.abs(row.darkCapital),
  ).length;

  const divergenceUp = rows.filter(
    (row) => row.changeRatio >= PUMP_THRESHOLD && row.darkCapital < 0,
  ).length;
  const divergenceDown = rows.filter(
    (row) => row.changeRatio <= DUMP_THRESHOLD && row.darkCapital > 0,
  ).length;

  return {
    pumpCount: pumps.length,
    dumpCount: dumps.length,
    darkLedPump,
    openLedPump,
    darkLedDump,
    openLedDump,
    divergenceUp,
    divergenceDown,
    topPumpCases: [...pumps]
      .sort((a, b) => b.changeRatio - a.changeRatio)
      .slice(0, 8)
      .map((row) =>
        buildBehaviorCase(
          row,
          darkShare(row) >= 0.55 && row.darkCapital > 0 ? "暗盘推升" : "明盘推升",
        ),
      ),
    topDumpCases: [...dumps]
      .sort((a, b) => a.changeRatio - b.changeRatio)
      .slice(0, 8)
      .map((row) =>
        buildBehaviorCase(
          row,
          row.darkCapital < 0 ? "暗盘砸盘" : "明盘砸盘",
        ),
      ),
  };
}

function computeFlowImpact(rows: TableSnapshot[]): FlowImpact {
  const changes = rows.map((row) => row.changeRatio);
  const darkValues = rows.map((row) => row.darkCapital);
  const openValues = rows.map((row) => row.openCapital);

  const darkLed = rows.filter((row) => darkShare(row) >= 0.55);
  const openLed = rows.filter((row) => darkShare(row) <= 0.45);

  const avg = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  const quadrants: FlowQuadrant[] = [
    {
      label: "暗流↑ 价↑",
      count: rows.filter((r) => r.darkCapital > 0 && r.changeRatio > 0).length,
      avgChange: avg(
        rows.filter((r) => r.darkCapital > 0 && r.changeRatio > 0).map((r) => r.changeRatio),
      ),
    },
    {
      label: "暗流↑ 价↓",
      count: rows.filter((r) => r.darkCapital > 0 && r.changeRatio < 0).length,
      avgChange: avg(
        rows.filter((r) => r.darkCapital > 0 && r.changeRatio < 0).map((r) => r.changeRatio),
      ),
    },
    {
      label: "暗流↓ 价↑",
      count: rows.filter((r) => r.darkCapital < 0 && r.changeRatio > 0).length,
      avgChange: avg(
        rows.filter((r) => r.darkCapital < 0 && r.changeRatio > 0).map((r) => r.changeRatio),
      ),
    },
    {
      label: "暗流↓ 价↓",
      count: rows.filter((r) => r.darkCapital < 0 && r.changeRatio < 0).length,
      avgChange: avg(
        rows.filter((r) => r.darkCapital < 0 && r.changeRatio < 0).map((r) => r.changeRatio),
      ),
    },
  ];

  const sortedByDark = [...rows].sort((a, b) => a.darkCapital - b.darkCapital);
  const quintileSize = Math.max(1, Math.floor(sortedByDark.length / 5));
  const darkQuintiles: FlowQuintile[] = [];

  for (let i = 0; i < 5; i += 1) {
    const slice = sortedByDark.slice(i * quintileSize, (i + 1) * quintileSize);
    if (slice.length === 0) continue;
    darkQuintiles.push({
      label: i === 0 ? "暗盘最弱" : i === 4 ? "暗盘最强" : `Q${i + 1}`,
      count: slice.length,
      avgChange: avg(slice.map((row) => row.changeRatio)),
      avgDarkCapital: avg(slice.map((row) => row.darkCapital)),
    });
  }

  return {
    darkPriceCorrelation: pearson(darkValues, changes),
    openPriceCorrelation: pearson(openValues, changes),
    darkLedAvgChange: avg(darkLed.map((row) => row.changeRatio)),
    openLedAvgChange: avg(openLed.map((row) => row.changeRatio)),
    quadrants,
    darkQuintiles,
  };
}

export function computeMarketBehavior(
  rows: TableSnapshot[],
  intraday: IntradayBehavior | null = null,
): MarketBehaviorAnalytics | null {
  if (rows.length === 0) return null;

  return {
    snapshot: computeSnapshotBehavior(rows),
    flowImpact: computeFlowImpact(rows),
    intraday,
  };
}

export function buildIntradayBehavior(
  pairs: Array<{
    stockCode: string;
    stockName: string;
    firstPriceRaw: number;
    lastPriceRaw: number;
    lastChangeRatio: number;
  }>,
  iterationCount: number,
): IntradayBehavior | null {
  if (iterationCount < 2 || pairs.length === 0) return null;

  const moves = pairs
    .map((pair) => {
      if (pair.firstPriceRaw <= 0) return null;
      const moveRatio =
        (pair.lastPriceRaw - pair.firstPriceRaw) / pair.firstPriceRaw;
      return {
        stockCode: pair.stockCode,
        stockName: pair.stockName,
        moveRatio,
        changeRatio: pair.lastChangeRatio,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const rapidPump = moves.filter((m) => m.moveRatio >= INTRADAY_MOVE_THRESHOLD);
  const rapidDump = moves.filter((m) => m.moveRatio <= -INTRADAY_MOVE_THRESHOLD);

  return {
    iterationCount,
    rapidPumpCount: rapidPump.length,
    rapidDumpCount: rapidDump.length,
    topIntradayPump: [...rapidPump]
      .sort((a, b) => b.moveRatio - a.moveRatio)
      .slice(0, 8),
    topIntradayDump: [...rapidDump]
      .sort((a, b) => a.moveRatio - b.moveRatio)
      .slice(0, 8),
  };
}

export { PUMP_THRESHOLD, DUMP_THRESHOLD, INTRADAY_MOVE_THRESHOLD };
