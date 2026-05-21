export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human size change, e.g. "-72%" (smaller) or "+5%" (larger). */
export function sizeDelta(from: number, to: number): string {
  if (from === 0) return "";
  const pct = Math.round((1 - to / from) * 100);
  return pct >= 0 ? `-${pct}%` : `+${Math.abs(pct)}%`;
}
