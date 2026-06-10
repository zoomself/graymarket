export function toDbDate(yyyymmdd: string): string {
  if (yyyymmdd.includes("-")) return yyyymmdd;
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function toApiDate(input: string): string {
  return input.replace(/-/g, "");
}
