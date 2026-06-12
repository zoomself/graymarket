import type { ClosingSignalType } from "@/lib/analytics/closing-move";

/** 涨幅≤此值视为「涨幅很少」（含下跌） */
export const WEAK_GAIN_THRESHOLD = 0.02;

/** 涨幅>此值视为「当日已明显上涨」 */
export const STRONG_GAIN_THRESHOLD = 0.02;

export interface ContinuationSample {
  prevDate: string;
  nextDate: string;
  stockCode: string;
  signalType: ClosingSignalType;
  prevChange: number;
  nextChange: number;
  darkDelta: number;
}

export interface ContinuationBucket {
  key: string;
  label: string;
  description: string;
  sampleCount: number;
  nextDayUpCount: number;
  nextDayUpRate: number;
  avgPrevChange: number;
  avgNextDayChange: number;
}

export interface ClosingContinuationStats {
  endDate: string;
  days: number;
  pairCount: number;
  totalSamples: number;
  buckets: ContinuationBucket[];
  insights: string[];
  message?: string;
}

type BucketRule = {
  key: string;
  label: string;
  description: string;
  match: (sample: ContinuationSample) => boolean;
};

const BUCKET_RULES: BucketRule[] = [
  {
    key: "all",
    label: "全部尾盘异动",
    description: "所有双双走强 / 暗盘走强信号",
    match: () => true,
  },
  {
    key: "weak-gain",
    label: "走强·涨幅≤2%",
    description: "资金走强但当日涨幅不超过 2%（含下跌）",
    match: (s) => s.prevChange <= WEAK_GAIN_THRESHOLD,
  },
  {
    key: "down",
    label: "走强·当日下跌",
    description: "资金走强但当日收跌",
    match: (s) => s.prevChange < 0,
  },
  {
    key: "flat-to-weak-up",
    label: "走强·平盘~小涨",
    description: "资金走强，当日涨幅 0~2%",
    match: (s) => s.prevChange >= 0 && s.prevChange <= WEAK_GAIN_THRESHOLD,
  },
  {
    key: "strong-gain",
    label: "走强·当日已涨>2%",
    description: "资金走强且当日涨幅已超过 2%",
    match: (s) => s.prevChange > STRONG_GAIN_THRESHOLD,
  },
];

function summarizeBucket(
  rule: BucketRule,
  samples: ContinuationSample[],
): ContinuationBucket {
  const matched = samples.filter(rule.match);
  const nextDayUpCount = matched.filter((s) => s.nextChange > 0).length;
  const sampleCount = matched.length;

  return {
    key: rule.key,
    label: rule.label,
    description: rule.description,
    sampleCount,
    nextDayUpCount,
    nextDayUpRate: sampleCount > 0 ? nextDayUpCount / sampleCount : 0,
    avgPrevChange:
      sampleCount > 0
        ? matched.reduce((sum, s) => sum + s.prevChange, 0) / sampleCount
        : 0,
    avgNextDayChange:
      sampleCount > 0
        ? matched.reduce((sum, s) => sum + s.nextChange, 0) / sampleCount
        : 0,
  };
}

function buildInsights(buckets: ContinuationBucket[], pairCount: number): string[] {
  const all = buckets.find((b) => b.key === "all");
  const weak = buckets.find((b) => b.key === "weak-gain");
  const down = buckets.find((b) => b.key === "down");
  const strong = buckets.find((b) => b.key === "strong-gain");

  if (!all || all.sampleCount === 0) {
    return ["样本不足，需更多交易日 Worker 采样"];
  }

  const insights: string[] = [
    `近 ${pairCount} 组交易日共 ${all.sampleCount} 条异动样本，隔日上涨概率 ${Math.round(all.nextDayUpRate * 100)}%`,
  ];

  if (weak && weak.sampleCount >= 5) {
    insights.push(
      `「走强·涨幅≤2%」${weak.sampleCount} 条样本，隔日上涨概率 ${Math.round(weak.nextDayUpRate * 100)}%，均涨 ${(weak.avgNextDayChange * 100).toFixed(2)}%`,
    );
    if (all.nextDayUpRate > 0) {
      const diff = (weak.nextDayUpRate - all.nextDayUpRate) * 100;
      if (Math.abs(diff) >= 3) {
        insights.push(
          diff > 0
            ? `弱涨幅走强形态隔日胜率高于整体 ${diff.toFixed(1)} 个百分点`
            : `弱涨幅走强形态隔日胜率低于整体 ${Math.abs(diff).toFixed(1)} 个百分点`,
        );
      }
    }
  }

  if (down && down.sampleCount >= 5 && weak && weak.sampleCount >= 5) {
    insights.push(
      `细分：当日下跌 ${Math.round(down.nextDayUpRate * 100)}% vs 平盘小涨 ${Math.round(
        (buckets.find((b) => b.key === "flat-to-weak-up")?.nextDayUpRate ?? 0) * 100,
      )}% 隔日上涨`,
    );
  }

  if (strong && strong.sampleCount >= 5 && weak && weak.sampleCount >= 5) {
    const diff = (weak.nextDayUpRate - strong.nextDayUpRate) * 100;
    if (Math.abs(diff) >= 5) {
      insights.push(
        diff > 0
          ? `弱涨幅走强隔日胜率比「已涨>2%」高 ${diff.toFixed(1)} 个百分点，或存在补涨空间`
          : `已大涨的走强信号隔日延续性更好（高 ${Math.abs(diff).toFixed(1)} 个百分点）`,
      );
    }
  }

  return insights;
}

export function computeClosingContinuationStats(
  endDate: string,
  days: number,
  samples: ContinuationSample[],
  pairCount: number,
): ClosingContinuationStats {
  if (samples.length === 0) {
    return {
      endDate,
      days,
      pairCount,
      totalSamples: 0,
      buckets: BUCKET_RULES.map((rule) => summarizeBucket(rule, [])),
      insights: ["暂无足够历史样本，需连续多个交易日且每日有尾盘异动"],
      message: "暂无足够历史样本",
    };
  }

  const buckets = BUCKET_RULES.map((rule) => summarizeBucket(rule, samples));

  return {
    endDate,
    days,
    pairCount,
    totalSamples: samples.length,
    buckets,
    insights: buildInsights(buckets, pairCount),
  };
}

export function matchesWeakGainPattern(prevChange: number): boolean {
  return prevChange <= WEAK_GAIN_THRESHOLD;
}

export function matchesDownPattern(prevChange: number): boolean {
  return prevChange < 0;
}
