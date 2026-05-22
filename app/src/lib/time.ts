/** Seconds → "M:SS" (or "H:MM:SS" past an hour). For the trim time fields. */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Parse "H:MM:SS" / "M:SS" / "SS" / "12.5" → seconds; null if invalid. */
export function parseTime(input: string): number | null {
  const text = input.trim();
  if (text === "") return null;
  const parts = text.split(":");
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n < 0) return null;
    seconds = seconds * 60 + n;
  }
  return seconds;
}
