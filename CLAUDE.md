# CLAUDE.md — Project Guide

## Project Overview

This is a **reusable composer portfolio site builder** built with **Astro 5**. It can be configured for any composer via YAML files in `source/` and the Keystatic CMS GUI.

## Tech Stack

- **Framework:** Astro 5 with MDX
- **CMS:** Keystatic (local storage mode, writes YAML)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 + SCSS (hybrid)
- **Content:** Astro content collections with Zod schemas
- **Config:** YAML files in `source/` read at build time via `src/utils/source-config.ts`
- **Icons:** `astro-icon` with Lucide icon set
- **Fonts:** Configurable via theme system (38+ options)
- **Node:** 22.12.0 (see `.nvmrc`)

## Commands

```sh
npm run quickstart  # Install deps and start dev server
npm run dev         # Start dev server (setup wizard on first run, then Astro + Keystatic)
npm run setup       # Re-run the setup wizard
npm run build       # Production build
npm run preview     # Preview production build
npm run deploy      # SFTP deploy (requires config)
```

**Dev port:** 4321. Keystatic admin at `http://localhost:4321/keystatic/`.

## URL Convention

All internal links **must** end with a trailing slash (e.g., `/music/sobre-las-nubes/`).

## Source Config System

All site-wide configuration lives in `source/` as YAML files. The central reader is `src/utils/source-config.ts`.

**Pattern:** Each reader uses Zod for validation with sensible defaults. Results are memoized per build.

## Core Principles

### 1. Accessibility First
- **Target:** WCAG 2.2 AA compliance
- Semantic HTML, keyboard navigation, screen reader support, focus indicators
- Never rely on color alone; ensure sufficient contrast ratios
- Respect `prefers-reduced-motion`

### 2. TypeScript Rigor
- No `any`. Prefer unions over `string`. Use Zod for runtime validation.

### 3. Responsive Design
- Mobile-first. Use fluid typography and spacing tokens.
- Test across all viewport sizes including ultrawide.

## Styling Conventions

- Design tokens as CSS custom properties
- SCSS for design system layer, Tailwind for component utilities
- Dark mode via `.darkmode` class

## Things to Avoid

- Weakening TypeScript strictness or ESLint a11y rules
- Using `div` or `span` for interactive elements
- Removing focus indicators or skip links
- Hardcoding colors outside the design token system
- Using `px` for font sizes
