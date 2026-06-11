import iconv from "iconv-lite";
import { matchesRequestedTradeDate } from "@/lib/dates";
import type {
  DarkTradeApiResponse,
  DarkTradeFetchParams,
  DarkTradeRawItem,
  DarkTradeSnapshot,
} from "./types";

const BASE_URL =
  "https://quotederivates.eastmoney.com/datacenter/darktrade";

function getReferer(): string {
  return process.env.EASTMONEY_REFERER ?? "https://emrnweb.eastmoney.com/";
}

export function mapRawItem(item: DarkTradeRawItem): DarkTradeSnapshot {
  return {
    stockCode: item["4"],
    stockName: item["16"],
    industry: item["17"] ?? "",
    concept: item["18"] ?? "",
    darkCapital: item["6"],
    openCapital: item["7"],
    totalCapital: item["8"],
    darkActivity: item["11"],
    priceRaw: item["13"],
    changeRatio: item["14"],
    rankNo: item["21"],
  };
}

export function formatTradeDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function fetchDarkTradePage(
  params: DarkTradeFetchParams,
): Promise<DarkTradeApiResponse> {
  const url = new URL(BASE_URL);
  url.searchParams.set("version", "100");
  url.searchParams.set("cver", "100");
  url.searchParams.set("date", params.date);
  url.searchParams.set("StartPage", String(params.startPage ?? 1));
  url.searchParams.set("NumPerPage", String(params.numPerPage ?? 30));
  url.searchParams.set("sortflag", String(params.sortflag ?? 6));
  url.searchParams.set("desc", String(params.desc ?? 1));
  url.searchParams.set("market", params.market ?? "");
  url.searchParams.set("datetype", params.datetype ?? "");

  const response = await fetch(url.toString(), {
    headers: {
      Referer: getReferer(),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      gtoken: "",
      rnProjectId: "emrn.GrayMarketRank",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`East Money API HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = iconv.decode(buffer, "gbk");
  return JSON.parse(text) as DarkTradeApiResponse;
}

export async function fetchAllDarkTradePages(
  params: Omit<DarkTradeFetchParams, "startPage">,
  options?: { pageDelayMs?: number; onPage?: (page: number, count: number) => void },
): Promise<{ tradeDate: number; totalCount: number; items: DarkTradeSnapshot[] }> {
  const pageDelayMs = options?.pageDelayMs ?? 200;
  const items: DarkTradeSnapshot[] = [];
  let startPage = 1;
  let tradeDate = 0;
  let totalCount = 0;

  while (true) {
    const response = await fetchDarkTradePage({ ...params, startPage });

    if (response.errid !== 0 || !response.data?.length) {
      break;
    }

    if (startPage === 1 && !matchesRequestedTradeDate(params.date, response["1"])) {
      break;
    }

    tradeDate = response["1"];
    totalCount = response["2"];
    items.push(...response.data.map(mapRawItem));
    options?.onPage?.(startPage, response.data.length);

    if (totalCount > 0 && items.length >= totalCount) {
      break;
    }

    if (response.data.length < (params.numPerPage ?? 30)) {
      break;
    }

    startPage += 1;
    if (pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }

  return { tradeDate, totalCount, items };
}

export async function probeTradingDay(date: string): Promise<boolean> {
  try {
    const response = await fetchDarkTradePage({
      date,
      startPage: 1,
      numPerPage: 1,
    });
    return (
      response.errid === 0 &&
      (response.data?.length ?? 0) > 0 &&
      matchesRequestedTradeDate(date, response["1"])
    );
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatPrice(priceRaw: number): string {
  return (priceRaw / 1000).toFixed(2);
}

export function formatCapital(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  }
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(2)}万`;
  }
  return `${sign}${abs.toFixed(0)}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}
