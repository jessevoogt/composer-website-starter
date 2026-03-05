# Deployment Guide

This project includes a built-in SFTP deployment script that uploads only changed files to your server. This guide covers initial setup and ongoing deployment.

## Prerequisites

- A web server with SFTP access (e.g. a VPS running Apache or Nginx)
- SSH/SFTP credentials (username + password)
- macOS (the deploy script uses macOS Keychain for secure password storage)

## 1. Configure SFTP Settings

Edit `source/site/deploy.yaml` (or use Keystatic > Settings > Deploy):

```yaml
sftpHost: your-server.com
sftpUser: your-username
sftpRemotePath: /public_html
sftpPort: 22
```

| Field              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `sftpHost`         | Server hostname or IP address                            |
| `sftpUser`         | SFTP username                                            |
| `sftpRemotePath`   | Remote directory for the site (e.g. `/public_html`)      |
| `sftpPort`         | SSH port (default: `22`)                                 |

### Private files path

If your `sftpRemotePath` contains `public_html`, the deploy script automatically derives a private path by replacing `public_html` with `private_html`. This is used for files that should not be publicly accessible (e.g. gated PDF scores). You can override this with `sftpPrivateRemotePath` if your server uses a different convention.

## 2. Store Your Password Securely

The SFTP password is stored in the **macOS Keychain** and never written to disk. Run this once:

```sh
security add-generic-password -a "your-username" -s "your-server.com" -w
```

You will be prompted to enter the password. It is stored securely in your login keychain and retrieved automatically by the deploy script.

**Important:** The `-a` (account) value must match `sftpUser` and the `-s` (service) value must match `sftpHost` in your `deploy.yaml`.

## 3. Build and Deploy

```sh
# Build the site
npm run build

# Deploy changed files
npm run deploy

# Preview what would be uploaded (no changes made)
npm run deploy -- --dry-run
```

## Deploy Flags

| Flag          | Description                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| `--dry-run`   | Show what would be uploaded without making changes. Uses the local manifest, no network needed |
| `--verify`    | Compare local files against the live server via SFTP. Slow but thorough for auditing drift     |
| `--force`     | Clear the local manifest and re-upload all files                                               |
| `--skip-api`  | Deploy the static site only, skip the `api/` backend                                          |

## How Change Detection Works

The deploy script maintains a local `.deploy-manifest.json` that records the size and SHA-256 hash of every uploaded file. On each deploy:

1. If a file's size differs from the manifest, it is uploaded
2. If the size matches, the hash is compared; the file is uploaded only if it changed
3. Files absent from the manifest are treated as new and uploaded
4. Remote files not present locally are left alone (no deletions)

## What Gets Deployed

| Local directory | Remote destination        | Notes                                     |
| --------------- | ------------------------- | ----------------------------------------- |
| `dist/`         | `sftpRemotePath/`        | Astro static site output                  |
| `api/`          | `sftpRemotePath/api/`    | PHP backend (excludes `.env`, `storage/`) |

### Files never deployed

- `.DS_Store`, `Thumbs.db`, `desktop.ini` (OS metadata)
- `api/.env` (server-only environment config, must be created manually on the server)
- `api/storage/` (server-side storage, never overwritten)

## API Backend Setup

If you use the contact form or perusal score gating, the PHP API backend needs a `.env` file on the server. Create `api/.env` on the server with:

```env
SENDGRID_API_KEY=your-sendgrid-api-key
OWNER_EMAIL=your-email@example.com
SITE_URL=https://your-site.com
```

The `api/.env.validation` and `api/email-templates.json` files are auto-generated from your YAML config and deployed automatically.

## Troubleshooting

**"SFTP password not found in macOS Keychain"**
Re-run the `security add-generic-password` command, making sure the account (`-a`) and service (`-s`) values match your `deploy.yaml` exactly.

**"Missing required config in source/site/deploy.yaml"**
Ensure `sftpHost`, `sftpUser`, and `sftpRemotePath` are all set in your deploy config.

**Files appear unchanged after deploy**
Your server may be caching. Check for server-side caching headers or CDN configuration. Run `npm run deploy -- --verify` to confirm the remote files match your local build.
