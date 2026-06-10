import { fetchAllDarkTradePages, fetchDarkTradePage, mapRawItem } from "./client";
import { getTabConfig, type TabKey } from "./tabs";
import type { DarkTradeSnapshot } from "./types";

interface CacheEntry {
  tradeDate: string;
  totalCount: number;
  items: DarkTradeSnapshot[];
  complete: boolean;
}

const cache = new Map<string, CacheEntry>();
const cacheTimestamps = new Map<string, number>();
const refreshingKeys = new Set<string>();

const CACHE_TTL_MS = 30_000;
const PREVIEW_PAGES = Number(process.env.LIVE_PREVIEW_PAGES ?? 10);

function cacheKey(date: string, tab: TabKey): string {
  const { market, datetype } = getTabConfig(tab);
  return `${date}:${market}:${datetype}`;
}

function isStale(key: string, now = Date.now()): boolean {
  const cachedAt = cacheTimestamps.get(key) ?? 0;
  return now - cachedAt >= CACHE_TTL_MS;
}

async function fetchPreview(
  date: string,
  tab: TabKey,
): Promise<CacheEntry> {
  const { market, datetype } = getTabConfig(tab);
  const previewItems: DarkTradeSnapshot[] = [];
  let totalCount = 0;
  let page = 1;

  while (page <= PREVIEW_PAGES) {
    const response = await fetchDarkTradePage({
      date,
      startPage: page,
      numPerPage: 30,
      sortflag: 6,
      desc: 1,
      market,
      datetype,
    });

    if (response.errid !== 0 || !response.data?.length) {
      break;
    }

    totalCount = response["2"];
    previewItems.push(...response.data.map(mapRawItem));
    page += 1;
  }

  return {
    tradeDate: date,
    totalCount,
    items: previewItems,
    complete: false,
  };
}

async function refreshFullCache(date: string, tab: TabKey, key: string) {
  if (refreshingKeys.has(key)) {
    return;
  }

  refreshingKeys.add(key);
  const { market, datetype } = getTabConfig(tab);

  try {
    const result = await fetchAllDarkTradePages(
      {
        date,
        numPerPage: 30,
        sortflag: 6,
        desc: 1,
        market,
        datetype,
      },
      { pageDelayMs: 100 },
    );

    cache.set(key, {
      tradeDate: date,
      totalCount: result.totalCount,
      items: result.items,
      complete: true,
    });
    cacheTimestamps.set(key, Date.now());
  } catch (error) {
    console.warn("Background full cache refresh failed:", error);
  } finally {
    refreshingKeys.delete(key);
  }
}

export async function getLiveDarkTradeCached(
  date: string,
  tab: TabKey = "stock",
) {
  const key = cacheKey(date, tab);
  const now = Date.now();
  const cached = cache.get(key);

  if (cached) {
    if (cached.complete) {
      if (isStale(key, now)) {
        void refreshFullCache(date, tab, key);
      }
      return cached;
    }

    if (!refreshingKeys.has(key)) {
      void refreshFullCache(date, tab, key);
    }
    return cached;
  }

  const preview = await fetchPreview(date, tab);
  cache.set(key, preview);
  cacheTimestamps.set(key, now);

  if (preview.items.length > 0) {
    void refreshFullCache(date, tab, key);
  }

  return preview;
}

export function clearLiveDarkTradeCache() {
  cache.clear();
  cacheTimestamps.clear();
  refreshingKeys.clear();
}
