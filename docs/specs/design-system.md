# Design System Spec

> **Status**: Shipped (tokens + shared components in the desktop app)
> **Last updated**: 2026-05-22
> **Coverage**: Theme, Colors, Typography, Spacing, Radius, Elevation, Components, Layout, Do/Don't, a11y
> **Source of truth**: `app/src/styles.css` (`@theme` block); shared components in
> `app/src/components/ui.tsx`. Derived from the Calendly reference the owner provided.

Toolzy follows the **Calendly "Sky Blueprint on Bright Paper"** aesthetic: a bright, light
theme with deep indigo text, a single confident action-blue for interaction, soft
slate-tinted shadows, generous spacing, and consistent rounded corners. Professional but
friendly. Clarity over decoration.

**Scope decisions** (locked):

- **Light theme only** in V1. Dark mode is backlog.
- **One type family** (see font decision). No decorative typefaces.
- **8px base unit** for all spacing. Comfortable density.
- **Tailwind v4** is the implementation. Tokens live in a single `@theme` block; components
  use the generated utilities, not raw hex.

---

## 1. Font decision (important)

The reference uses **Gilroy**, which is a **commercial/proprietary font** — we cannot bundle
it in an open-source project. The reference's own documented substitute is **Montserrat**
(SIL Open Font License, free, geometric, very close match).

**Decision:** ship **Montserrat** as the actual loaded family (bundled via
`@fontsource/montserrat`), and keep the token name `--font-gilroy` so component code and the
reference vocabulary stay aligned:

```
--font-gilroy: "Montserrat", ui-sans-serif, system-ui, sans-serif;
```

If a licensed Gilroy is ever purchased, swap the `--font-gilroy` value — no component changes
needed. Weights used: 400 / 500 / 600 / 700.

---

## 2. Color tokens

Light theme. Use the Tailwind utility, never the raw hex.

| Token / utility suffix | Hex | Role |
|---|---|---|
| `midnight-indigo` | `#0B3558` | Primary text, headings, inactive nav. The branded "almost-black". |
| `action-blue` | `#006BFF` | Primary CTA, active nav, key interactive accents. **The one action color.** |
| `glacier-blue` | `#004EBA` | Informational badge text / alerts. |
| `slate-blue` | `#476788` | Secondary text, supporting info, icon fills. |
| `steel-gray` | `#A6BBD1` | Tertiary text, disabled states, fine borders. |
| `platinum-tint` | `#D4E0ED` | Inactive field borders, subtle dividers. |
| `outline-gray` | `#E6E6E6` | Separators, hairline borders. |
| `pale-gray` | `#E7EDF6` | Badge fills, soft background separation. |
| `cloud-mist` | `#F8F9FB` | Off-white section backgrounds. |
| `snow-white` | `#ffffff` | Page background, card surfaces. |
| `text-black` | `#0A0A0A` | General body text / default links (never pure `#000`). |
| `lavender-glow` | `#e55cff` | Decorative accent (abstract shapes, illustration). |
| `royal-amethyst` | `#8247f5` | Decorative accent. |
| `ocean-glimmer` | `#BB32D5` | Decorative accent. |
| `sunset-gold` | `#ffa600` | Decorative accent (warmth). |
| `skybound-blue` | `#0099ff` | Decorative accent. |

Rule: the five vibrant accents (`lavender-glow`, `royal-amethyst`, `ocean-glimmer`,
`sunset-gold`, `skybound-blue`) are for **graphics/illustration only** — never for text
blocks or as a second CTA color.

---

## 3. Typography

Family: `font-gilroy` (Montserrat). Scale (each utility carries its line-height):

| Utility | Size | Line height | Use |
|---|---|---|---|
| `text-body` | 14px | 1.71 | small/caption |
| `text-body-lg` | 16px | 1.6 | body default |
| `text-subheading` | 18px | 1.6 | lead paragraph |
| `text-heading` | 24px | 1.4 | card titles, H3 |
| `text-heading-lg` | 28px | 1.2 | H2 |
| `text-display-sm` | 38px | 1.21 | section title (mobile hero) |
| `text-display` | 50px | 1.1 | section hero |
| `text-display-lg` | 68px | 1.1 | page hero (desktop) |

> **Defined where:** the app (`app/src/styles.css`) ships through `text-display-sm` (it only
> needs the smaller end). The landing site (`site/src/styles.css`) additionally defines
> `text-display` / `text-display-lg` for its hero. Add a token before using it.

Weights: `font-normal` 400 (body) · `font-medium` 500 (nav) · `font-semibold` 600 (titles,
buttons) · `font-bold` 700 (display headlines). Letter spacing: normal.

---

## 4. Spacing

Base unit **8px**. Tailwind v4's default spacing scale already is a 4/8px grid, so we use the
stock utilities — there are **no custom `--spacing-*` tokens** (note: Tailwind's `p-24` = 96px,
not 24px). Values in actual use: container padding `px-6` (24px), section rhythm `py-12`/`py-16`,
card and grid gaps `gap-6`. Stay on the scale to keep the 8px feel.

---

## 5. Radius

| Element | Value | Utility |
|---|---|---|
| small | 4px | `rounded-md` |
| buttons | 8px | `rounded-lg` |
| medium | 12px | `rounded-xl` |
| **cards** | **16px** | `rounded-2xl` |
| large | 24px | `rounded-3xl` |
| badges/pills | 50px | `rounded-full` |

---

## 6. Elevation (shadows)

Two soft, slate-tinted (`rgba(71,103,136,…)`) shadows are defined — `--shadow-sm` and
`--shadow-sm-2`. Map by intent:

| Intent | Token / utility |
|---|---|
| Resting / elevated card | `shadow-sm-2` (the deep triple-layer — featured surfaces) |
| Hover / interactive lift | `shadow-sm` |
| Button focus | a `focus-visible` ring (`focusRing` in `ui.tsx`), not a shadow |

Don't put heavy shadows on non-interactive, non-emphasized elements.

---

## 7. Components

Class recipes (Tailwind v4 utilities). Implemented in `app/src/components/ui.tsx`.

### Button
- **Primary CTA**: `bg-action-blue text-snow-white rounded-lg font-semibold px-4 py-1.5`
  (lg size: `px-6 py-3 text-body-lg`). Hover: `brightness-105`.
  Focus: `focus-visible:ring-2 ring-action-blue ring-offset-2` (the shared `focusRing`).
- **Ghost (dark)**: transparent, `text-midnight-indigo font-semibold`, `rounded-lg`,
  optional `border border-platinum-tint`. Secondary actions.
- **Ghost (neutral)**: transparent, `text-text-black`. Tertiary/nav contexts.
- **Ghost (light)**: transparent, `text-snow-white`, `rounded-md`. For dark backgrounds.

### Card (Floating Content Card)
`bg-snow-white rounded-2xl shadow-sm-2 p-6` (24px). Hover (if interactive):
`transition-shadow hover:shadow-sm`. No border by default.

### Badge (Informational)
`bg-pale-gray text-glacier-blue rounded-full text-body font-semibold px-2 py-1` (8px/4px).

### Nav link
`text-midnight-indigo font-medium text-body-lg hover:text-action-blue transition-colors`.
Active = `text-action-blue`.

### Text link
Body links `text-text-black`; prominent links `text-action-blue`. No underline at rest;
underline or color shift on hover.

---

## 8. Layout

- **Container**: max-width centered (app `max-w-[1000px]`, site `max-w-[1100px]`), horizontal
  padding `px-6` (24px). Background `snow-white`; alternating sections may use `cloud-mist`.
- **Header**: sticky top bar, `bg-snow-white/90` + backdrop blur, hairline
  `border-b border-outline-gray`. Currently **minimal — just the Toolzy logo** (left). Nav and
  a right-aligned CTA ("Get the desktop app") can return once there are more destinations.
- **Hero**: large centered (or left) headline (`text-display-lg`, `font-bold`,
  `text-midnight-indigo`), supporting paragraph (`text-subheading`, `text-slate-blue`), a
  primary CTA, optionally a floating product card with abstract accent shapes behind it.
- **Vertical rhythm**: ~40px section gap; comfortable breathing room.

---

## 9. Imagery

Product mockups inside cards with `shadow-sm-2`. Decorative **abstract fluid shapes** in the
vibrant accents (lavender/amethyst/gold/sky), slightly overlapping, behind product cards —
energetic, never overwhelming. Icons: simple line/filled, in `midnight-indigo` or
`slate-blue`. Profile photos only as small circles in social proof.

---

## 10. Do / Don't

**Do**
- Use `font-gilroy` (Montserrat) for all text.
- Reserve `action-blue` for the primary action path.
- Apply `rounded-2xl` + `shadow-sm-2` to prominent elevated cards.
- Hierarchy: `midnight-indigo` headings, `slate-blue` secondary text.
- Use `pale-gray` for soft separations / badge fills.

**Don't**
- No saturated accent colors for large text blocks — accents are for graphics only.
- No heavy shadows on non-interactive elements.
- No extra font families.
- Don't break the 8px spacing grid.
- Never pure black `#000` — use `text-black` (#0A0A0A) or `midnight-indigo`.

---

## 11. Accessibility

- Body copy uses `midnight-indigo` / `text-black` on light bg (high contrast). `slate-blue`
  is fine for secondary text ≥16px; avoid it for small low-contrast text. `steel-gray` is
  disabled-only.
- Every interactive element has a visible `focus-visible` ring (`action-blue`, 2px, offset).
- Hit targets ≥ 40px. Don't rely on color alone to convey state (pair with text/icon).

---

## 12. Out of scope (V1)

- Dark theme (backlog; tokens are structured so a `.dark` override can be added later).
- Motion/animation system beyond simple hover transitions.
- Licensed Gilroy (using Montserrat substitute — see §1).
