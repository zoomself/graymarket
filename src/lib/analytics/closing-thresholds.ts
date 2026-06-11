export interface ClosingThresholds {
  /** Minimum dark pool increase since 13:00 baseline (yuan) */
  minDarkDelta: number;
  /** Minimum lit pool increase for「双双走强」(yuan) */
  minOpenDelta: number;
}

export const DEFAULT_CLOSING_THRESHOLDS: ClosingThresholds = {
  minDarkDelta: 2_000_000,
  minOpenDelta: 2_000_000,
};

export const CLOSING_THRESHOLDS_STORAGE_KEY = "graymarket-closing-thresholds";

const MIN_YUAN = 0;
const MAX_YUAN = 1_000_000_000;

function clampYuan(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_YUAN, Math.max(MIN_YUAN, Math.round(value)));
}

export function wanToYuan(wan: number): number {
  return clampYuan(wan * 10_000, DEFAULT_CLOSING_THRESHOLDS.minDarkDelta);
}

export function yuanToWan(yuan: number): number {
  return Math.round(yuan / 10_000);
}

export function normalizeClosingThresholds(
  input: Partial<ClosingThresholds> | null | undefined,
): ClosingThresholds {
  return {
    minDarkDelta: clampYuan(
      input?.minDarkDelta ?? DEFAULT_CLOSING_THRESHOLDS.minDarkDelta,
      DEFAULT_CLOSING_THRESHOLDS.minDarkDelta,
    ),
    minOpenDelta: clampYuan(
      input?.minOpenDelta ?? DEFAULT_CLOSING_THRESHOLDS.minOpenDelta,
      DEFAULT_CLOSING_THRESHOLDS.minOpenDelta,
    ),
  };
}

export function parseClosingThresholdsFromSearchParams(
  searchParams: URLSearchParams,
): ClosingThresholds {
  const parseParam = (key: keyof ClosingThresholds) => {
    const raw = searchParams.get(key);
    if (raw === null || raw === "") return undefined;
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
  };

  return normalizeClosingThresholds({
    minDarkDelta: parseParam("minDarkDelta"),
    minOpenDelta: parseParam("minOpenDelta"),
  });
}

export function closingThresholdsToQuery(thresholds: ClosingThresholds): string {
  const t = normalizeClosingThresholds(thresholds);
  return new URLSearchParams({
    minDarkDelta: String(t.minDarkDelta),
    minOpenDelta: String(t.minOpenDelta),
  }).toString();
}

export function loadClosingThresholdsFromStorage(): ClosingThresholds {
  if (typeof window === "undefined") return DEFAULT_CLOSING_THRESHOLDS;
  try {
    const raw = localStorage.getItem(CLOSING_THRESHOLDS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLOSING_THRESHOLDS;
    return normalizeClosingThresholds(JSON.parse(raw) as Partial<ClosingThresholds>);
  } catch {
    return DEFAULT_CLOSING_THRESHOLDS;
  }
}

export function saveClosingThresholdsToStorage(thresholds: ClosingThresholds): void {
  localStorage.setItem(
    CLOSING_THRESHOLDS_STORAGE_KEY,
    JSON.stringify(normalizeClosingThresholds(thresholds)),
  );
}
