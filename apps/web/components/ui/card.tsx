import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

/** Floating Content Card: white, 16px radius, soft triple-layer shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-snow-white rounded-2xl shadow-sm-2", className)} {...props} />;
}
