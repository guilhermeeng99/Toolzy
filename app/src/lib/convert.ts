import { invoke } from "@tauri-apps/api/core";

export type ImageTarget = "png" | "jpg";
export type ResizeMode = "none" | "px" | "percent";

export interface ResizeOpt {
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  keepAspectRatio: boolean;
}

export interface ConvertImageArgs {
  path: string;
  target: ImageTarget;
  quality?: number;
  resize?: ResizeOpt;
}

/**
 * Convert an image file natively (Rust `image` crate) and return the saved path.
 * The Rust command reads/writes the file directly — no bytes cross the IPC.
 */
export function convertImage(args: ConvertImageArgs): Promise<string> {
  return invoke<string>("convert_image", { ...args });
}
