# Setup Guide

This guide explains how to set up the composer portfolio site.

## Features

- Audio player that keeps playing as you navigate from page to page
- Perusal Score viewer, with workflow from pdf file to images with watermark added automatically. It is also possible to have the site ONLY be a list of scores that open this score viewer. Perusal Score also has its own audio player that plays the audio for that work (all movements if multiple).
- Contact form (UI only - no actual processing logic), which can be configured just to be an email address
- A few basic preconfigured starter themes and customization capability of colors and fonts
- Social Media preview image generation from assets (this is the image that shows when you share your site with Facebook or Instagram for example)
- Custom logo
- Ability to set background image and theme via dev tools directly on the site when run locally in dev mode
- Home Page: Split-page Hero
- Home Page: Featured Recordings section (optional)
- Home Page: Select Items section (optional)
- simple local-only workflow with conventions-based source folder structure to house raw assets like wav, mp3, jpg, png, and pdf scores
- Push-button build/preview/deploy via buttons at bottom right of CMS (keystatic)

## What is NOT supported

- Any back-end forms (these would have to be implemented separately on your server to handle the contact form)
- WYSIWIG editing - you edit in the local CMS (or just editing yaml directly) and then save while running dev, and it will hot-reload the localhost:4321 Astro website to show the changes

## Prerequisites

- **Node.js** 22.x (see `.nvmrc` for exact version)
- **npm** 10+
- **ffmpeg** (optional — needed for WAV/AIFF/FLAC audio conversion and duration detection)

## Quick Start

```sh
# 1. Install dependencies
npm install

# 2. Initialize local composer content from the template
npm run init:source

# 3. Start the dev server (opens browser + Keystatic CMS)
npm run dev
```

This will launch the starter website at `http://localhost:4321/`
You can open `http://localhost:4322/keystatic` to configure your site using the CMS interface.
This CMS is also available via a button in the Astro Dev Tools, which will link directly
to the settings page for that page.

## Source Template Workflow

- `source-template/` is committed starter content.
- `source/` is your local working copy and is gitignored by default.
- `npm run dev`, `npm run build`, and ingest commands auto-run `init:source` if `source/` is missing.
- To reset your local content back to defaults, run `npm run init:source:reset`.
- If you intentionally want to commit `source/` in your own repo, remove the `source/` rule from `.gitignore`.

## Configuration

All composer-specific data lives in the local `source/` folder. You can edit these files directly (they're YAML) or use the Keystatic GUI at `/keystatic`.

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
mainNavFontSizePx: 15

menuItems:
  - label: Works
    href: /works/
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
Set `mainNavFontSizePx` to change desktop header menu text size.

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

### Audio Player (`source/site/audio-player.yaml`)

Controls the featured audio player shown on work pages:

```yaml
hideFeaturedPlayerControls: false
enableTrackTextScroll: true
forceHideControls:
  previousTrack: false
  playPause: false
  nextTrack: false
  seek: false
  mute: false
  volume: false
  currentTime: false
  duration: false
  trackDetails: false
  trackText: false
```

A separate config at `source/pages/perusal-scores/audio-player.yaml` controls the audio player on perusal score pages. Values set to `inherit` fall back to the site-wide player config above.

### Theme (`source/site/theme.yaml`)

Theme colors and typography live in `source/site/theme.yaml` (or the **Theme** singleton in Keystatic).

- `fontBody` and `fontHeading` can be switched to bundled local fonts, `system-ui`, or supported Google Fonts.
- When a Google Font is selected, the site injects the required `fonts.googleapis.com` stylesheet automatically.

### Brand / Logo (`source/branding/brand-logo.yaml`)

Use this config to control text fallback and image sizing metadata for the header logo.

```yaml
firstName: Jane
lastName: Doe
logoImageAlt: Jane Doe logo # optional
logoWidth: 180 # optional, px
logoHeight: 52 # optional, px
```

- Add an image named `logo.*` inside `source/branding/` to enable image logo mode automatically.
- Supported `logo.*` formats: `.svg`, `.ico`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`.
- If no `logo.*` file exists, the site falls back to text logo mode (`firstName` + `lastName`).
- `logoWidth` and `logoHeight` are optional pixel controls exposed in Keystatic (Brand / Logo).

### Branding Assets (`source/branding/`)

Place your favicon, logo, and social preview images here:

- `favicon.svg` — SVG favicon
- `favicon.ico` — ICO fallback
- `favicon-96x96.png` — 96px PNG favicon
- `apple-touch-icon.png` — 180px Apple touch icon
- `web-app-manifest-192x192.png` — PWA icon (192px)
- `web-app-manifest-512x512.png` — PWA icon (512px)
- `logo.svg` (or `.ico`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`) — optional header logo (auto-detected by `logo.*` filename)
- `social-preview-image.png` — Open Graph image
- `social-preview-image.svg` — SVG version of the social preview

`source/branding/` is the source of truth. During `npm run ingest:assets` (and therefore `npm run dev` / `npm run build`), files are copied from `source/branding/` to `public/`.

#### Social Preview Auto-Generation

Social preview files are handled by `scripts/generate-social-preview-image.mjs`:

- If both `source/branding/social-preview-image.svg` and `.png` exist, the script leaves them as-is.
- If one exists and the other is missing, it generates the missing one from the existing file.
- If both are missing, it generates both from:
  - `source/site/site.yaml` (`composerName`, `siteUrl`)
  - `source/site/theme.yaml` (theme colors/fonts)
  - `source/branding/favicon.svg` (or `favicon-96x96.png`) as a large monotone watermark behind the centered text

Run manually:

```sh
npm run generate:social-image
```

Force a full regeneration of both source files:

```sh
npm run generate:social-image -- --force
```

After generation, the script mirrors `source/branding/social-preview-image.{svg,png}` to `public/social-preview-image.{svg,png}`.

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

### Home: Hero (`source/pages/home/hero.yaml`)

```yaml
heroTitle: '' # Defaults to composer name
heroSubtitle: Composer
heroTagline: “A strikingly original voice — lyrical, atmospheric, and quietly unforgettable.”
listenNowText: Listen Now
searchMusicText: Search Music
preferredHeroId: ''
heroImageColumnSide: left
heroImageColumnWidthPercent: 41
```

### Home: Featured Recording (`source/pages/home/featured-recording.yaml`)

```yaml
featuredPlayerImageColumnSide: right
featuredPlayerImageColumnWidthPercent: 58
```

### Home: Select Works (`source/pages/home/select-works.yaml`)

```yaml
selectWorksLabel: Select Works
selectWorksRandomize: true
selectWorksShowAll: false
selectWorksMaxItems: 16 # omit for no max
selectWorksExcludeFeaturedWork: true
```

### Home: SEO (`source/pages/home/seo.yaml`)

```yaml
metaTitle: '' # Defaults to "Composer Name — Subtitle"
metaDescription: '' # Defaults to site description
searchResultText: ''
```

### Home: Contact (`source/pages/home/contact.yaml`)

```yaml
hideContactSection: false
contactIntro: '' # Optional override; blank = use Contact Page introText
contactEmailLeadText: '' # Optional override; blank = use Contact Page contactEmailLeadText
```

### Contact Page (`source/pages/contact.yaml`)

```yaml
title: Contact
metaTitle: '' # Defaults to "Contact Composer Name"
metaDescription: ''
introText: For score inquiries...
contactEmailLeadText: ''
contactEmailLinkText: '' # Blank = show the email address
contactFormEnabled: false # Set true when a form handler is wired up
contactFormNameLabel: Name
contactFormNamePlaceholder: What should I call you?
contactFormEmailLabel: Email
contactFormEmailPlaceholder: you@domain.com
contactFormMessageLabel: Message
contactFormMessagePlaceholder: Enter your message here...
contactFormSubmitText: Send
```

### Works Page (`source/pages/works.yaml`)

```yaml
title: Works
introText: '' # Blank = "A showcase of compositions by [composer name]."
hideIntroText: false
workLabelSingular: work
workLabelPlural: works
searchLabel: Search works
searchPlaceholder: Enter keywords...
preferredHeroId: hall
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

## Deployment

### SFTP Deploy

Configure in `source/site/deploy.yaml` (via Keystatic → Deployment):

```yaml
sftpHost: your-server.com
sftpUser: username
sftpRemotePath: /public_html
sftpPort: 22
sftpSkipAudio: false
```

The SFTP password is retrieved from a platform-specific secure store:

**macOS** — stored in Keychain:

```sh
security add-generic-password -a "username" -s "your-server.com" -w
```

**Windows / Linux** — set the `SFTP_PASSWORD` environment variable:

```sh
export SFTP_PASSWORD="your-password"         # Linux / macOS fallback
$env:SFTP_PASSWORD = "your-password"         # PowerShell
set SFTP_PASSWORD=your-password              # cmd.exe
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
lint  →  init:source  →  ingest:assets  →  generate:data  →  lint  →  astro build
  ↓            ↓               ↓                 ↓              ↓           ↓
tsc,      Creates local    Copies hero,      Generates work   tsc,      Builds static
eslint,   source/ from     branding, and     images, perusal  eslint,   HTML output
astro     source-template/ profile assets;   score data, and  astro
check                      auto-generates    search index     check
                           missing social
                           preview assets
```
