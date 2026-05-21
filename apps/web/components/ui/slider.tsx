import { cn } from "@/lib/cn";
import type { CSSProperties, ComponentProps } from "react";

interface SliderProps extends Omit<ComponentProps<"input">, "type"> {
  value: number;
  min?: number;
  max?: number;
}

/**
 * Styled range input. The filled portion is computed from value/min/max and
 * passed to CSS as `--fill` (see `.toolzy-range` in globals.css).
 */
export function Slider({ value, min = 0, max = 100, className, style, ...props }: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      className={cn("toolzy-range", className)}
      style={{ ...style, "--fill": `${pct}%` } as CSSProperties}
      {...props}
    />
  );
}
