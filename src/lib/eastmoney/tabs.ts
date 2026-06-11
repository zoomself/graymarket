export type TabKey = "overview" | "stock" | "industry" | "concept" | "closing";

export interface TabConfig {
  key: TabKey;
  label: string;
  market: string;
  datetype: string;
}

/** Matches East Money graymarket API params */
export const TABS: TabConfig[] = [
  { key: "overview", label: "概览", market: "", datetype: "" },
  { key: "stock", label: "个股", market: "", datetype: "" },
  { key: "industry", label: "行业板块", market: "90", datetype: "2" },
  { key: "concept", label: "概念板块", market: "90", datetype: "3" },
  { key: "closing", label: "尾盘异动", market: "", datetype: "" },
];

export function getTabConfig(key: TabKey): TabConfig {
  return TABS.find((t) => t.key === key) ?? TABS[0];
}

export function parseTabKey(value: string | null | undefined): TabKey {
  if (value === "overview") return "overview";
  if (value === "block" || value === "industry") return "industry";
  if (value === "concept") return "concept";
  if (value === "closing" || value === "tail") return "closing";
  return "stock";
}

/** Overview and closing reuse stock-level iteration data or dedicated APIs. */
export function isStockLikeTab(tab: TabKey): boolean {
  return tab === "overview" || tab === "stock" || tab === "closing";
}

export function filterSnapshots<
  T extends { stockCode: string; stockName: string },
>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter(
    (row) =>
      row.stockCode.toLowerCase().includes(q) ||
      row.stockName.toLowerCase().includes(q),
  );
}

/** East Money occasionally returns duplicate codes; keep the best-ranked row. */
export function dedupeSnapshotsByStockCode<
  T extends { stockCode: string; rankNo: number },
>(rows: T[]): T[] {
  const byCode = new Map<string, T>();

  for (const row of rows) {
    const existing = byCode.get(row.stockCode);
    if (!existing || row.rankNo < existing.rankNo) {
      byCode.set(row.stockCode, row);
    }
  }

  return [...byCode.values()].sort((a, b) => a.rankNo - b.rankNo);
}
