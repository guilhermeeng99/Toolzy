/** Base file name from a full path (handles both `\` and `/` separators). */
export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Lower-cased file extension without the dot; "" when there is none. */
export const extOf = (p: string): string => p.split(".").pop()?.toLowerCase() ?? "";

/** File name without its extension, e.g. "report.pdf" → "report". */
export const stripExt = (p: string): string => {
  const name = baseName(p);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};
