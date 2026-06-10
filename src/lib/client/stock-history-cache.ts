export interface StockHistoryPoint {
  capturedAt: string;
  iterationNo: number;
  darkCapital: number;
  openCapital: number;
  priceRaw: number;
}

interface CacheEntry {
  points: StockHistoryPoint[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<StockHistoryPoint[]>>();

function cacheKey(stockCode: string, tradeDate: string): string {
  return `${tradeDate}:${stockCode}`;
}

export function getCachedStockHistory(
  stockCode: string,
  tradeDate: string,
): StockHistoryPoint[] | null {
  return cache.get(cacheKey(stockCode, tradeDate))?.points ?? null;
}

export function invalidateStockHistoryCache(tradeDate?: string): void {
  if (!tradeDate) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(`${tradeDate}:`)) {
      cache.delete(key);
    }
  }
}

export async function fetchStockHistory(
  stockCode: string,
  tradeDate: string,
  options?: { force?: boolean },
): Promise<StockHistoryPoint[]> {
  const key = cacheKey(stockCode, tradeDate);
  const force = options?.force ?? false;

  if (!force) {
    const cached = cache.get(key);
    if (cached) {
      return cached.points;
    }

    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }
  } else {
    cache.delete(key);
  }

  const query = force
    ? `/api/stocks/${stockCode}/history?date=${tradeDate}&_=${Date.now()}`
    : `/api/stocks/${stockCode}/history?date=${tradeDate}`;

  const promise = fetch(query)
    .then(async (res) => {
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      const points = (data.points ?? []) as StockHistoryPoint[];
      cache.set(key, { points, fetchedAt: Date.now() });
      return points;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function prefetchStockHistory(stockCode: string, tradeDate: string): void {
  void fetchStockHistory(stockCode, tradeDate).catch(() => {
    // Prefetch failures are non-fatal.
  });
}

export function preloadChartLibrary(): void {
  void import("echarts-for-react");
}
