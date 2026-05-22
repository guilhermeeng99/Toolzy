/** Base file name from a full path (handles both `\` and `/` separators). */
export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Lower-cased file extension without the dot; "" when there is none. */
export const extOf = (p: string): string => p.split(".").pop()?.toLowerCase() ?? "";
