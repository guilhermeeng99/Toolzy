# Toolzy — landing site

A tiny static page presenting the app and linking to downloads (GitHub Releases).
Stack: **Vite + Tailwind v4** (no framework). One page, no backend.

Standalone (not in the repo's pnpm workspace):

```bash
pnpm install   # run inside site/
pnpm dev                          # local preview
pnpm build                        # static output → dist/
```

Deploys to **GitHub Pages** automatically via `.github/workflows/deploy-site.yml` (or push
`dist/` to any static host). The download link in `index.html` points at GitHub Releases.
