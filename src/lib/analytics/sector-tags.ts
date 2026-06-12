/** Split East Money concept field into individual tags. */
export function parseConceptTags(concept: string | null | undefined): string[] {
  if (!concept?.trim()) return [];
  return [...new Set(concept.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))];
}

export function parseIndustryTag(industry: string | null | undefined): string[] {
  if (!industry?.trim()) return [];
  return [industry.trim()];
}

export function sectorTagsForRow(
  industry: string | null | undefined,
  concept: string | null | undefined,
  groupBy: "industry" | "concept",
): string[] {
  return groupBy === "industry"
    ? parseIndustryTag(industry)
    : parseConceptTags(concept);
}
