# CLAUDE.md — Project Guide

## Project Overview

This is a **reusable composer portfolio site builder** built with **Astro 5**. It can be configured for any composer via YAML files in `source/` and the Keystatic CMS GUI. The owner is a composer by trade and a front-end/sometimes back-end web developer by day job. This is currently a **front-end-only** project — no back-end exists yet. When one is added, this file will be updated.

## Tech Stack

- **Framework:** Astro 5.17+ with MDX
- **CMS:** Keystatic (local storage mode, writes YAML)
- **Language:** TypeScript (strict mode via `astro/tsconfigs/strict`)
- **Styling:** Tailwind CSS 4 + CSS custom properties (design system tokens in `src/styles/site.css`, Tailwind for utilities)
- **Components:** 31 custom Astro components + `accessible-astro-components` library
- **Content:** Astro content collections with Zod schemas (works in MDX)
- **Config:** YAML files in `source/` read at build time via `src/utils/source-config.ts` with Zod validation
- **Icons:** `astro-icon` with Lucide icon set
- **Fonts:** Atkinson Hyperlegible (chosen for accessibility)
- **Node:** 22.x (see `.nvmrc` for exact version)

## Commands

```sh
npm run dev         # Ingest assets + generate data + start dev server + Keystatic
npm run dev:full    # Also runs ingest:works (full pipeline)
npm run build       # Lint + ingest assets + generate data + type check + Astro build
npm run build:full  # Also runs ingest:works
npm run preview     # Preview production build
npm run deploy      # SFTP deploy (requires config in source/site/deploy.yaml)
npm run keystatic   # Standalone Keystatic server
```

The build pipeline: `lint` → `ingest:assets` → `generate:data` → `lint` → `astro build`.
The `lint` script runs `tsc --noEmit`, `eslint .`, and `astro check`.

## Directory Structure

```
source/                        # ← All composer-specific data lives here
├── works/                     # Work definitions (YAML + binary assets)
├── site/                      # Site-wide config (YAML singletons)
│   ├── site.yaml              # Composer name, title, email, GA ID, perusal-only mode
│   ├── navigation.yaml        # Menu items + footer links
│   ├── social.yaml            # Social media links
│   ├── sharing.yaml           # Share button config for work pages
│   ├── audio-player.yaml      # Featured audio player controls
│   ├── theme.yaml             # Color + font overrides
│   └── deploy.yaml            # SFTP deployment config
├── pages/                     # Page content
│   ├── home/                  # Homepage section configs
│   │   ├── hero.yaml
│   │   ├── featured-recording.yaml
│   │   ├── select-works.yaml
│   │   ├── seo.yaml
│   │   └── contact.yaml
│   ├── contact.yaml           # Contact page content
│   └── about/                 # About page content + profile image
│       ├── about.yaml
│       └── profile.jpg
├── home/hero/                 # Hero images (NN-slug.jpg + NN-slug.yaml sidecars)
│   └── hero-config.yaml       # Preferred/fallback hero ID, default filter
└── branding/                  # Favicon, social preview, brand logo config
    ├── brand-logo.yaml        # first and last name
    ├── favicon.svg
    ├── favicon.ico
    └── ...

src/
├── components/                # Astro components (31 files)
├── content/works/             # MDX content collection (generated from source/works/)
├── layouts/                   # SiteLayout, PerusalLayout
├── pages/                     # Routes: index, about, contact, works/*, 404, sitemap
├── styles/                    # Tailwind entry point + site.css
└── utils/
    ├── source-config.ts       # ★ Central config reader — all YAML → typed data
    ├── prepareWorks.ts        # Work collection processing
    ├── slugify.ts             # URL slug generation
    └── works-images.ts        # Generated works image manifest

scripts/
├── ingest-assets.mjs          # Copies source/ assets → public/ and src/assets/
├── ingest-works.mjs           # Processes source/works/ → src/content/works/
├── generate-works-images.mjs  # Generates work thumbnails
├── generate-perusal-scores.mjs
├── deploy.mjs                 # SFTP deploy (reads source/site/deploy.yaml)
└── keystatic-server.mjs       # Keystatic dev server
```

Path aliases: `@components/*`, `@layouts/*`, `@assets/*`, `@/utils/*`, `@data/*`.

## Source Config System

All site-wide configuration lives in `source/` as YAML files managed through Keystatic singletons. The central reader is `src/utils/source-config.ts`.

**Key functions:**

- `getSiteConfig()` — composer name, site title, email, GA ID, perusal-only mode
- `getNavigation()`, `getPrimaryNavLinks()` — menu items, footer links
- `getSocialLinks()` — social media links (platform, url, enabled)
- `getSharingConfig()` — share button config for work pages
- `getHomePage()`, `getContactPage()`, `getAboutPage()` — page content
- `getBrandConfig()` — first/last name
- `getDeployConfig()`, `isDeployConfigured()` — SFTP settings
- `getHeroVariants()`, `getHeroConfig()` — hero images from folder scan
- `getThemeConfig()` — color/font overrides

**Pattern:** Each reader uses Zod for validation with sensible defaults. Results are memoized per build. If a YAML file is missing, the fallback (from Zod defaults) is used.

## Keystatic Singletons

Keystatic config is in `keystatic.config.ts`. Singletons map to YAML files:

- `site` → `source/site/site.yaml`
- `navigation` → `source/site/navigation.yaml`
- `social` → `source/site/social.yaml`
- `sharing` → `source/site/sharing.yaml`
- `theme` → `source/site/theme.yaml`
- `deploy` → `source/site/deploy.yaml`
- `brandLogo` → `source/branding/brand-logo.yaml`
- `homeHero` → `source/pages/home/hero.yaml`
- `homeFeaturedRecording` → `source/pages/home/featured-recording.yaml`
- `homeSelectWorks` → `source/pages/home/select-works.yaml`
- `homeSeo` → `source/pages/home/seo.yaml`
- `homeContact` → `source/pages/home/contact.yaml`
- `contactPage` → `source/pages/contact.yaml`
- `aboutPage` → `source/pages/about/about.yaml`
- `siteAudioPlayerControls` → `source/site/audio-player.yaml`
- `perusalScoreAudioPlayerControls` → `source/pages/perusal-scores/audio-player.yaml`

The `works` collection maps to `source/works/*/work.yaml`.

## Brand Logo System

Renders composer name as styled text via `BrandText.astro`.

## Perusal-Score-Only Mode

When `perusalScoreOnlyMode: true` in `source/site/site.yaml`:

- The homepage renders a minimal index of works with perusal scores (`PerusalOnlyIndex.astro`)
- Other pages (about, contact, works listing, work detail, browse) render a redirect to `/`
- Perusal score pages themselves are unaffected

## Core Principles (Non-Negotiable)

### 1. Accessibility First

Every piece of new or modified code **must** be assessed for accessibility. This is not optional.

- **Target:** WCAG 2.2 AA compliance (EAA-aware)
- **Semantic HTML:** Always prefer native semantic elements (`<nav>`, `<section>`, `<button>`, etc.) over divs with ARIA roles. Use ARIA only when no semantic element exists for the pattern.
- **Keyboard navigation:** All interactive elements must be fully operable via keyboard. Test tab order, focus management, `Enter`/`Space` activation, and `Escape` to dismiss.
- **Screen readers:** Use `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-expanded`, `aria-current`, `aria-live` regions, etc. as appropriate. Hide decorative elements with `aria-hidden="true"`. Use `.sr-only` for screen-reader-only text.
- **Focus indicators:** Never remove focus outlines. The project uses custom `:focus-visible` styles defined in `site.css`.
- **Color and contrast:** Never rely on color alone to convey meaning. Ensure sufficient contrast ratios (4.5:1 for normal text, 3:1 for large text). The project uses OKLCH color palettes — check that generated shades meet contrast requirements.
- **Visual impairments:** Design for color blindness (avoid red/green as sole differentiators), low vision (support zoom to 200% without content loss), and other visual conditions.
- **Motion:** Respect `prefers-reduced-motion`. Disable or reduce animations for users who request it. This is already wired in `site.css`.
- **Complex widgets:** When building custom interactive patterns (tabs, accordions, comboboxes, dialogs, etc.), follow the [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) exactly.
- **Existing tooling:** `eslint-plugin-jsx-a11y` is configured in strict mode. Do not weaken these rules.

### 2. TypeScript Rigor

The project uses strict TypeScript. Write code that leverages the type system to prevent bugs at compile time.

- **No `any`:** Never use `any`. If you encounter existing `any` types, replace them with proper types.
- **Avoid `unknown` when possible:** Use `unknown` only at true system boundaries (e.g., parsing external JSON). Narrow it immediately with type guards or Zod.
- **Prefer unions over `string`:** When a value comes from a known set (tags, categories, statuses, component variants, etc.), define a union type or enum. Use `as const` satisfies patterns where appropriate.
- **Discriminated unions:** Use discriminated unions for modeling variants (e.g., different recording types, content states). Pair with exhaustive pattern matching.
- **`ts-pattern`:** Install and use [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) for exhaustive matching on discriminated unions and complex conditional logic. Prefer `match()` over switch statements or if/else chains when matching on more than 2 variants.
- **Zod schemas:** Content collections already use Zod. Continue using Zod for any runtime validation, and infer TypeScript types from schemas with `z.infer<>` to avoid type duplication.
- **When refactoring:** If you touch a file and notice loose types (`any`, overly broad `string`, untyped parameters), tighten them as part of the change. Don't leave type debt behind.

### 3. Responsive Design

All UI must work across the full spectrum of screen sizes.

- **Mobile-first:** Write styles mobile-first, layering complexity for larger screens.
- **Breakpoints:** Use Tailwind responsive prefixes or the breakpoints defined in `site.css`. Don't invent custom breakpoints.
- **Ultrawide:** Test and ensure layouts don't break or become unreadable on very wide screens. Use `max-width` constraints (the `.container` utility caps at a readable measure). Content should not stretch edge-to-edge on a 3440px+ display.
- **Fluid typography:** The project uses Utopia-based fluid type scales defined as CSS custom properties. Use these (`--font-size-*`) rather than hardcoded `px` or `rem` values for font sizes.
- **Fluid spacing:** Similarly, use the spacing scale custom properties (`--space-*`) for consistent, responsive spacing.
- **Touch targets:** Interactive elements must have a minimum touch target of 44x44px on mobile.
- **No horizontal scroll:** Content must never cause horizontal scrolling at any viewport width.

## Styling Conventions

- **Design tokens** live in `src/styles/site.css` as CSS custom properties (`:root` block). Use them.
- **`site.css`** contains the full design system: tokens, reset, typography, focus styles, utility classes, and dark mode overrides.
- **Tailwind** is for component-level utility styling in templates.
- **Dark mode** uses the `.darkmode` class on the root element. Define dark variants using the existing CSS custom property overrides in `site.css`.
- Formatting is handled by Prettier (2-space indent, no semicolons, single quotes, 120 char line width). Don't fight it.

## Content Collections

Works are defined in `src/content/works/` as MDX files (generated from `source/works/` by the ingest pipeline). The schema is in `src/content.config.ts` and includes:

- Metadata: title, composer, description, tags, instrumentation, difficulty, duration
- Related data: recordings, performances, sheet music (each with their own sub-schemas)
- Thumbnails with required alt text

When modifying the content schema, update the Zod schema in `content.config.ts` and ensure all existing content files still validate.

## Linting & Formatting

```sh
npx eslint .        # Lint (includes a11y checks)
npx prettier --check .  # Check formatting
```

ESLint is configured with:

- `eslint-plugin-astro` (recommended + jsx-a11y-strict)
- `@typescript-eslint` (recommended)
- `eslint-plugin-jsx-a11y` (strict mode for JSX/TSX)

## Things to Avoid

- Adding a back-end or server-side logic (not yet — this will come later)
- Weakening TypeScript strictness or ESLint a11y rules
- Using `div` or `span` for interactive elements (use `button`, `a`, `input`, etc.)
- Removing focus indicators or skip links
- Hardcoding colors outside the design token system
- Hardcoding composer-specific text in components (use source-config readers)
- Creating non-responsive layouts
- Using `px` for font sizes (use fluid type scale tokens)
- Editing YAML files in `source/` without checking Keystatic singleton alignment
