/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export, deployed to Cloudflare Pages (see docs/specs/architecture.md ADR-004).
  output: "export",
  // Required for `output: export`: no Image Optimization server.
  images: { unoptimized: true },
  // We lint with Biome, not ESLint; don't fail the build on a missing ESLint config.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
