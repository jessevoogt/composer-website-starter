# Setup Guide

This guide explains how to set up the composer portfolio site for a new composer.

## Prerequisites

- **Node.js** 22.12+ (see `.nvmrc`)
- **npm** 10+

## Quick Start

```sh
# 1. Install dependencies
npm install

# 2. Start the dev server (opens browser + Keystatic CMS)
npm run dev
```

Open `http://localhost:4321/keystatic` to configure your site using the CMS interface.

## Configuration

All composer-specific data lives in the `source/` folder. You can edit these files directly (they're YAML) or use the Keystatic GUI at `/keystatic`.

### Site Identity (`source/site/site.yaml`)

| Field                  | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `composerName`         | Your full name (used throughout the site)                         |
| `siteTitle`            | Browser tab title (e.g. "Jane Doe - Composer")                    |
| `siteDescription`      | Default meta description for search engines                       |
| `siteUrl`              | Canonical URL (e.g. `https://janedoe.com`)                        |
| `email`                | Contact email shown on the contact page                           |
| `copyrightHolder`      | Footer copyright name (defaults to composer name)                 |
| `googleAnalyticsId`    | GA4 Measurement ID (e.g. `G-XXXXXXXXXX`). Leave blank to disable. |
| `perusalScoreOnlyMode` | `true` = minimal site with only perusal score pages               |

### Navigation (`source/site/navigation.yaml`)

Customise which menu items appear in the header and footer:

```yaml
menuItems:
  - label: Music
    href: /music/
    enabled: true
    order: 0
  - label: About
    href: /about/
    enabled: true
    order: 1
  - label: Contact
    href: /contact/
    enabled: true
    order: 2

footerLinks:
  - label: Accessibility
    href: /accessibility-statement/
  - label: Sitemap
    href: /sitemap/
```

Set `enabled: false` to hide a menu item without removing it.

### Social Media (`source/site/social.yaml`)

```yaml
links:
  - platform: instagram
    url: https://www.instagram.com/yourhandle/
    enabled: true
  - platform: youtube
    url: https://www.youtube.com/@yourchannel
    enabled: true
```

Supported platforms: `instagram`, `youtube`, `facebook`, `soundcloud`, `twitter`, `linkedin`, `tiktok`, `bandcamp`.

### Share Buttons (`source/site/sharing.yaml`)

Controls which share buttons appear on work detail pages:

```yaml
enabledShares:
  - facebook
  - twitter
  - email
  - copy-link
```

Options: `facebook`, `twitter`, `threads`, `bluesky`, `email`, `copy-link`, `linkedin`.

### Brand / Logo (`source/branding/brand-logo.yaml`)

```yaml
mode: text # "text" (default) or "plugin"
pluginId: custom-animation # Used when mode is "plugin"
firstName: Jane
lastName: Doe
```

- **`text` mode**: Displays your name as styled text in the header. This is the default and works for any composer.
- **`plugin` mode**: Loads the brand plugin selected by `pluginId`.
- **`pluginId: custom-animation`**: Uses the custom SVG animation plugin (specific to the original site). Its markup, CSS, and JS are isolated from the generic layout.

### Branding Assets (`source/branding/`)

Place your favicon and social preview images here:

- `favicon.svg` — SVG favicon
- `favicon.ico` — ICO fallback
- `favicon-96x96.png` — 96px PNG favicon
- `apple-touch-icon.png` — 180px Apple touch icon
- `web-app-manifest-192x192.png` — PWA icon (192px)
- `web-app-manifest-512x512.png` — PWA icon (512px)
- `social-preview-image.png` — Open Graph image
- `social-preview-image.svg` — SVG version of the social preview

These are automatically copied to `public/` by the `ingest:assets` script during build.

### Hero Images (`source/home/hero/`)

Hero images for the homepage background. Convention: `NN-slug.jpg` with an optional `NN-slug.yaml` sidecar.

**Image file** (e.g. `01-concert-hall.jpg`):

- Name format: two-digit prefix for sort order, then a slug
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`

**Sidecar YAML** (e.g. `01-concert-hall.yaml`):

```yaml
label: Concert Hall
alt: Grand concert hall with a piano on stage.
credit: 'Photo by Someone on Unsplash'
position: 50% 58%
filter: ''
```

**Hero config** (`hero-config.yaml`):

```yaml
preferredHeroId: concert-hall # slug of the preferred default hero
fallbackHeroId: inside-piano # fallback if preferred not found
defaultFilter: saturate(0.72) contrast(1.06) brightness(0.72)
```

### Homepage Hero (`source/pages/home/hero.yaml`)

```yaml
heroTitle: '' # Defaults to composer name
heroSubtitle: Composer
heroTagline: Original concert music for acoustic instruments and ensembles.
actions:
  listenNow:
    visible: true
    label: Listen Now
  searchMusic:
    visible: true
    label: Search Music
preferredHeroId: profile
fallbackHeroId: inside-piano
defaultFilter: saturate(0.72) contrast(1.06) brightness(0.72)
```

Hero presentation defaults such as layout, image mirroring, divider styling, hero typography scale, and hero button style belong to the active theme. Adjust those in Theme Studio under the `Home Hero` panel, then save a new theme if you want a variant.

### Homepage (`source/pages/home.yaml`)

```yaml
metaTitle: '' # Defaults to "Composer Name — Subtitle"
metaDescription: '' # Defaults to site description
contactIntro: Whether you are interested in a score...
```

### Contact Page (`source/pages/contact.yaml`)

```yaml
title: Contact
metaTitle: '' # Defaults to "Contact Composer Name"
metaDescription: ''
introText: Whether you are interested in a score...
contactFormEnabled: false # Set true when a form handler is wired up
```

### About Page (`source/pages/about/`)

- `about.yaml` — bio text, meta description, profile image alt text
- `profile.jpg` (or `.png`, `.webp`) — your profile photo

The bio uses Keystatic's rich text editor and supports paragraphs (separated by blank lines), bold, italic, and links.

## Adding Works

Works live in `source/works/`. Each work has its own folder containing:

- `work.yaml` — metadata (title, description, tags, recordings, etc.)
- `thumbnail.{jpg,png,webp}` — work thumbnail image
- `score.pdf` — perusal score (optional)
- `recordings/` — recording audio and photos

Use Keystatic at `/keystatic` → Works to manage these through the GUI.

After adding or modifying works, run:

```sh
npm run ingest:works    # Process works into content collections
npm run build           # Rebuild the site
```

## Newsletter

Collect subscriber emails through your contact and perusal score request forms, and send newsletters from your local machine.

To enable: go to Keystatic > **Global: Newsletter** and toggle **Enable newsletter opt-in**. Then add a `NEWSLETTER_SECRET` to `api/.env` for sending.

Full setup, sending instructions, and subscriber management: **[Newsletter Guide](NEWSLETTER.md)**

## Deployment

### SFTP Deploy

Configure in `source/site/deploy.yaml` (via Keystatic → Deployment):

```yaml
sftpHost: your-server.com
sftpUser: username
sftpRemotePath: /public_html
sftpPort: 22
```

The SFTP password is stored in the macOS Keychain (never on disk):

```sh
security add-generic-password -a "username" -s "your-server.com" -w
```

Then deploy:

```sh
npm run build
npm run deploy           # Upload changed files
npm run deploy -- --dry-run  # Preview what would change
```

### Perusal-Score-Only Mode

If you already have a main website and only need perusal score hosting:

1. Set `perusalScoreOnlyMode: true` in Keystatic → Site Identity
2. Build and deploy as normal
3. The site will show a minimal index linking to each work's perusal score

## Build Pipeline

```
ingest:assets  →  generate:data  →  tsc --noEmit  →  astro build
     ↓                  ↓                                  ↓
Copies hero,      Generates work       Type checks    Builds static
branding, and     images, perusal                     HTML output
profile assets    score data, and
to public/ and    search index
src/assets/
```
