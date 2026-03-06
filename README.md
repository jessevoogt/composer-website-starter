# Composer Website Starter

A production-ready starter for composers who want to launch and maintain their own portfolio site with an editor-friendly workflow.

Help videos (Loom): [https://loom.com/share/folder/2761fba900c74c808e86297045f58f13](https://loom.com/share/folder/2761fba900c74c808e86297045f58f13)

Built with [Astro 5](https://astro.build/) and [Keystatic](https://keystatic.com/), this starter includes:
- Setup wizard for first-time project configuration
- Composer-focused content model (works, perusal scores, social, contact)
- Accessible front-end and content editing workflow
- Optional PHP API for contact and score-access email flows

## 1. What this starter is, who it is for, and the workflow

This starter is for:
- Composers who want a professional website without rebuilding a CMS from scratch
- Developers/freelancers delivering composer sites repeatedly
- Teams that want content editing in Keystatic after initial setup

Typical workflow:
1. Run setup wizard once (`npm run dev`) to configure identity, theme, homepage, about page, starter works, and forms.
2. Keep building content through Keystatic (`/keystatic/`) or by editing YAML/MDX in `source/`.
3. Preview locally, then run `npm run build`.
4. Deploy via built-in SFTP deploy (`npm run deploy`) or any alternative deployment strategy.

## Quick start

Double-click launcher (recommended):
- macOS: `Quickstart.command`
- Windows: `Quickstart.bat`

Or run in Terminal:

```bash
git clone <your-repo-url> my-composer-site
cd my-composer-site
npm run quickstart
```

This runs `npm install` and then `npm run dev`.

Setup wizard opens on first run (default `http://127.0.0.1:3456/`), then the Astro app runs at `http://127.0.0.1:4321/`.

Re-run setup wizard later:
```bash
npm run setup
```

## 2. Prerequisites

Minimum/recommended local tooling:
- **Node.js**: `22.21.1+` (project ships with `.nvmrc`)
- **npm**: `10+`
- **Git**: recommended for version control

Install/update guides:
- Node.js download/docs: [https://nodejs.org/en/download](https://nodejs.org/en/download)
- npm docs: [https://docs.npmjs.com/downloading-and-installing-node-js-and-npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- nvm (recommended for managing Node versions): [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm)

For optional form/perusal backend:
- **PHP**: `8.1+` (see `api/composer.json`)
- **Composer**: `2+`
- **SendGrid account**: required for email delivery in the provided backend implementation

## 3. Manual setup required for form integration (SendGrid + PHP backend)

The front-end form UI is included by default, but actual email delivery requires backend configuration.

This project's API implementation is designed around:
- SendGrid email delivery
- Apache + PHP hosting (via `api/.htaccess` rewrite rules)

### Backend setup steps

1. Create env file:
```bash
cp api/.env.example api/.env
```
2. Fill required values in `api/.env`:
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL` (must be a verified SendGrid sender)
   - `CONTACT_RECIPIENT`
   - `FRONTEND_URL`
   - `HMAC_SECRET` (must match perusal token secret used by the site)
3. Install PHP deps if needed:
```bash
cd api
composer install
```
4. Set your frontend API endpoint in `source/site/site.yaml` (`apiEndpoint`).
5. Deploy `api/` to a PHP host and ensure routing points requests to `api/public/index.php`.

### Important hosting assumption

The included API expects Apache-style behavior (`.htaccess`, `mod_rewrite`) and direct PHP execution.

If you deploy on another stack (Nginx, Caddy, serverless functions, etc.), you must adapt:
- URL rewrites/routing
- Access restrictions for private paths (`api/src`, `api/vendor`, `api/storage`, `.env`)
- Environment variable loading and runtime config

The SendGrid integration in `api/src/Mailer.php` can be replaced or extended for another provider.

## 4. Deployment feature (SFTP + deploy manifest) and alternatives

Built-in deployment command:
```bash
npm run build
npm run deploy
```

It reads config from `source/site/deploy.yaml` and uses SFTP credentials from macOS Keychain.

### Deploy manifest (faster incremental deploys)

The script maintains `.deploy-manifest.json` with file hashes and sizes.
- Unchanged files are skipped
- Only new/changed files are uploaded
- This significantly reduces upload time for iterative deployments

Useful deploy flags:
- `npm run deploy -- --dry-run` preview what would upload (no network)
- `npm run deploy -- --verify` compare local output vs remote files
- `npm run deploy -- --force` re-upload everything (reset manifest behavior)

### Alternatives to SFTP deploy

If you do not want to use built-in SFTP deploy:
1. **Static-only hosting** (no PHP features): upload `dist/` to platforms like Netlify, Vercel, Cloudflare Pages, or GitHub Pages.
2. **Split deploy**: deploy `dist/` with any CI/CD workflow and deploy `api/` separately to your PHP host.
3. **Custom transport**: use rsync/SSH, Git-based deploys, or your hosting provider's pipeline.

If you use an alternative deploy path, you can ignore `npm run deploy` and `source/site/deploy.yaml`.

## Core commands

```bash
npm run quickstart    # install deps and start dev server in one command
npm run dev          # first run opens setup wizard, then Astro + Keystatic
npm run setup        # re-open setup wizard
npm run build        # production build
npm run preview      # preview production build
npm run deploy       # built-in SFTP deploy (optional)
```

## License

MIT
