import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

/** Informational Badge: pale-gray fill, glacier-blue text, pill shape. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-pale-gray text-glacier-blue text-body font-semibold px-2 py-1",
        className,
      )}
      {...props}
    />
  );
}
