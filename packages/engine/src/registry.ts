import type { Converter, Environment } from "./types";

/**
 * Holds the registered converters. The UI is driven by this set: format
 * dropdowns and environment gating are derived from what is registered.
 */
export class ConverterRegistry {
  private readonly map = new Map<string, Converter>();

  register(converter: Converter): void {
    if (this.map.has(converter.id)) {
      throw new Error(`Converter already registered: ${converter.id}`);
    }
    this.map.set(converter.id, converter);
  }

  get(id: string): Converter | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  /** Converters available in `env`. Undefined or "both" applies no filter. */
  list(env?: Environment): Converter[] {
    const all = [...this.map.values()];
    if (!env || env === "both") return all;
    return all.filter((c) => c.environment === env || c.environment === "both");
  }

  /** First converter that accepts `from` and produces `to` within `env`. */
  find(from: string, to: string, env?: Environment): Converter | undefined {
    return this.list(env).find((c) => c.inputs.includes(from) && c.outputs.includes(to));
  }

  clear(): void {
    this.map.clear();
  }
}

/** Shared singleton. Converters self-register here on import. */
export const registry = new ConverterRegistry();
