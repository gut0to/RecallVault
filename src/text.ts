/** Truncate UTF-16 text without leaving an unpaired surrogate at the boundary. */
export function truncate(text: string, budget: number): string {
  let end = Math.min(text.length, Math.max(0, Math.floor(budget)));
  if (end > 0 && /[\uD800-\uDBFF]/.test(text[end-1]!) && /[\uDC00-\uDFFF]/.test(text[end] ?? '')) end--;
  return text.slice(0, end);
}

/** Select a relevant content window rather than always returning the opening paragraph. */
export function excerpt(text: string, terms: string[], budget: number): string {
  if (text.length <= budget) return text;
  const lower = text.toLowerCase();
  const matches = terms.map(t => lower.indexOf(t.toLowerCase())).filter(i => i >= 0);
  const first = matches.length ? Math.min(...matches) : 0;
  let start = Math.max(0, first - Math.min(80, Math.floor(budget / 4)));
  if (/[\uDC00-\uDFFF]/.test(text[start] ?? '')) start++;
  return truncate(text.slice(start), budget);
}
