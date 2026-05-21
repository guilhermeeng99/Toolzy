import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost" | "ghostNeutral" | "ghostLight";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-action-blue text-snow-white hover:brightness-105 hover:shadow-sm-3",
  ghost:
    "bg-transparent text-midnight-indigo border border-platinum-tint hover:border-action-blue hover:text-action-blue",
  ghostNeutral: "bg-transparent text-text-black hover:text-action-blue",
  ghostLight: "bg-transparent text-snow-white rounded-md hover:bg-white/10",
};

const sizes: Record<ButtonSize, string> = {
  // Reference CTA: ~6px vertical / 16px horizontal padding.
  sm: "px-3 py-1 text-body",
  md: "px-4 py-1.5 text-body-lg",
  lg: "px-6 py-3 text-body-lg",
};

/** Class recipe: reuse on `<a>` elements that should look like buttons. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
