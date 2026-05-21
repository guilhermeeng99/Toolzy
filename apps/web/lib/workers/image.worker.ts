import {
  type ConversionOutput,
  type ImageOptions,
  type Result,
  imageConverter,
} from "@toolzy/engine";
import * as Comlink from "comlink";

// Runs the image conversion off the main thread. The engine uses Canvas APIs
// (createImageBitmap + OffscreenCanvas), both available in a Web Worker.
const api = {
  convert(file: File, target: string, options: ImageOptions): Promise<Result<ConversionOutput>> {
    return imageConverter.convert(file, target, options);
  },
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
