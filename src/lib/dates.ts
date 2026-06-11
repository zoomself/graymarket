export function toDbDate(yyyymmdd: string): string {
  if (yyyymmdd.includes("-")) return yyyymmdd;
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function toApiDate(input: string): string {
  return input.replace(/-/g, "");
}

/** East Money may return the nearest trading day when the requested date has no data. */
export function matchesRequestedTradeDate(
  requested: string,
  apiTradeDate: number,
): boolean {
  return toApiDate(requested) === String(apiTradeDate);
}
