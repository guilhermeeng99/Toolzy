import type { SVGProps } from "react";

// Minimal line icons (stroke = currentColor). Dependency-free for the scaffold;
// a richer icon set can replace these when real tools land.

type IconProps = SVGProps<SVGSVGElement>;

const svg = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function ImageIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function MediaIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function ToolzyLogo(props: IconProps) {
  return (
    <svg {...svg({ strokeWidth: 2, ...props })} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7v13" />
      <path d="M15 7v13" />
      <path d="M4 13h16" />
    </svg>
  );
}

export function LinkedinIcon(props: IconProps) {
  return (
    <svg {...svg(props)} aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
