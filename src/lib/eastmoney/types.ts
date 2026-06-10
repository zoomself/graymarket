/** Raw item from East Money darktrade API */
export interface DarkTradeRawItem {
  "3": number;
  "4": string;
  "5": number;
  "6": number;
  "7": number;
  "8": number;
  "9": number;
  "10": number;
  "11": number;
  "12": number;
  "13": number;
  "14": number;
  "15": string;
  "16": string;
  "17": string;
  "18": string;
  "19": number;
  "20": string;
  "21": number;
}

export interface DarkTradeApiResponse {
  errid: number;
  errmsg: string;
  "1": number;
  "2": number;
  data?: DarkTradeRawItem[];
}

export interface DarkTradeSnapshot {
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  darkCapital: number;
  openCapital: number;
  totalCapital: number;
  darkActivity: number;
  priceRaw: number;
  changeRatio: number;
  rankNo: number;
}

export interface DarkTradeFetchParams {
  date: string;
  startPage?: number;
  numPerPage?: number;
  sortflag?: number;
  desc?: 0 | 1;
  market?: string;
  datetype?: string;
}

export interface QueuePayload {
  tradeDate: string;
  iterationNo: number;
  capturedAt: string;
  totalCount: number;
  items: DarkTradeSnapshot[];
}

export interface IterationMeta {
  id: string;
  tradeDate: string;
  iterationNo: number;
  startedAt: string;
  completedAt: string | null;
  recordCount: number;
  status: "running" | "completed" | "failed";
}

export interface SnapshotRow extends DarkTradeSnapshot {
  id: number;
  iterationId: string;
  tradeDate: string;
  capturedAt: string;
}

export type SortField =
  | "darkCapital"
  | "openCapital"
  | "changeRatio"
  | "darkActivity";
export type SortDirection = "asc" | "desc";
