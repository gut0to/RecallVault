/** Truncate UTF-16 text without leaving an unpaired surrogate at the boundary. */
export function truncate(text: string, budget: number): string {
  let end = Math.min(text.length, Math.max(0, Math.floor(budget)));
  if (end > 0 && /[\uD800-\uDBFF]/.test(text[end-1]!) && /[\uDC00-\uDFFF]/.test(text[end] ?? '')) end--;
  return text.slice(0, end);
}
