/** Zero-padded per-page filename, e.g. ("doc", 2, 10, "png") -> "doc-02.png". */
export function padPageName(base: string, page: number, total: number, ext: string): string {
  const width = Math.max(2, String(total).length);
  const num = String(page).padStart(width, "0");
  return `${base || "page"}-${num}.${ext}`;
}
