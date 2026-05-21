import {
  type ConversionOutput,
  type ImageOptions,
  type Result,
  imageConverter,
  registerBuiltins,
} from "@toolzy/engine";
import * as Comlink from "comlink";

// Runs the image conversion off the main thread. The engine uses Canvas APIs
// (createImageBitmap + OffscreenCanvas), both available in a Web Worker.
//
// Populate the shared registry so the engine's converter catalog reflects what
// can run here (the registry drives discovery / environment gating). Execution
// uses the typed converter directly — the registry is type-erased by design.
registerBuiltins();

const api = {
  convert(file: File, target: string, options: ImageOptions): Promise<Result<ConversionOutput>> {
    return imageConverter.convert(file, target, options);
  },
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
