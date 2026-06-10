export type TabKey = "stock" | "industry" | "concept";

export interface TabConfig {
  key: TabKey;
  label: string;
  market: string;
  datetype: string;
}

/** Matches East Money graymarket API params */
export const TABS: TabConfig[] = [
  { key: "stock", label: "个股", market: "", datetype: "" },
  { key: "industry", label: "行业板块", market: "90", datetype: "2" },
  { key: "concept", label: "概念板块", market: "90", datetype: "3" },
];

export function getTabConfig(key: TabKey): TabConfig {
  return TABS.find((t) => t.key === key) ?? TABS[0];
}

export function parseTabKey(value: string | null | undefined): TabKey {
  if (value === "block" || value === "industry") return "industry";
  if (value === "concept") return "concept";
  return "stock";
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
