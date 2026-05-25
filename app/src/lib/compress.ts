/** Compression strength, shared by the PDF and video compress tools. */
export type CompressLevel = "light" | "balanced" | "strong";

/** Output path + source/result byte sizes from a compress run (so the UI shows the saving). */
export interface CompressResult {
  path: string;
  before: number;
  after: number;
}
