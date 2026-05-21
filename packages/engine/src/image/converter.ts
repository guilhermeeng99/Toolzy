import { errors } from "../errors";
import { err, ok } from "../result";
import type { Converter } from "../types";
import { decodeImage, encodeImage } from "./canvas";
import {
  IMAGE_INPUTS,
  IMAGE_OUTPUTS,
  type ImageOptions,
  type ImageTarget,
  MAX_IMAGE_BYTES,
  TARGET_EXT,
} from "./types";

function isImageTarget(t: string): t is ImageTarget {
  return (IMAGE_OUTPUTS as readonly string[]).includes(t);
}

/** Replace the extension and fall back to "image" for empty names. */
function outputName(inputName: string, target: ImageTarget): string {
  const base = inputName.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${TARGET_EXT[target]}`;
}

export const imageConverter: Converter<ImageOptions> = {
  id: "image",
  inputs: IMAGE_INPUTS,
  outputs: IMAGE_OUTPUTS,
  environment: "both",
  async convert(file, target, options, ctx) {
    if (!isImageTarget(target)) {
      return err(errors.unsupportedFormat(file.type || "unknown", target));
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return err(errors.fileTooLarge(file.size, MAX_IMAGE_BYTES));
    }
    if (ctx?.signal?.aborted) return err(errors.canceled());

    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeImage(file);
    } catch (cause) {
      return err(errors.decodeFailed(file.type || "image", cause));
    }

    try {
      ctx?.onProgress?.(0.5);
      const blob = await encodeImage(bitmap, target, options ?? {});
      if (ctx?.signal?.aborted) return err(errors.canceled());
      ctx?.onProgress?.(1);
      const name = file instanceof File ? file.name : "image";
      return ok({ blob, format: target, filename: outputName(name, target), bytes: blob.size });
    } catch (cause) {
      return err(errors.encodeFailed(target, cause));
    } finally {
      bitmap.close();
    }
  },
};
