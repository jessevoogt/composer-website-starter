# Newsletter

Collect subscriber emails through your contact and perusal score request forms, and send newsletters using your existing email template styling.

## How it works

1. A newsletter opt-in checkbox appears on the contact form and the perusal score request form.
2. When a visitor submits either form with the checkbox checked, their email is saved to a subscriber list on your server.
3. You send newsletters from your local machine using a Node script that calls a protected API endpoint on your server.
4. Each subscriber receives an unsubscribe link in every newsletter. Unsubscribe works instantly via a browser link or email client native unsubscribe.

## Enabling the newsletter

### 1. Turn it on in Keystatic

Go to `/keystatic/` > **Global: Newsletter** and set:

| Field | Description |
| --- | --- |
| **Enable newsletter opt-in** | Turns the checkbox on/off across all forms |
| **Checkbox label** | Text shown next to the checkbox (e.g. "Keep me updated on new music and performances") |
| **Checkbox checked by default** | Whether the checkbox is pre-checked. GDPR requires unchecked (explicit opt-in) for EU visitors. |
| **Show info tooltip** | Adds a small info button next to the checkbox that shows a privacy message on hover/focus |
| **Info tooltip text** | The privacy reassurance message shown in the tooltip |

Or edit `source/site/newsletter.yaml` directly:

```yaml
enabled: true
checkboxLabel: Keep me updated on new music and performances
checkboxDefaultChecked: false
showCheckboxInfo: true
checkboxInfoText: "We respect your privacy. Your email is only used for occasional updates — never shared or sold. You can unsubscribe at any time."
```

### 2. Generate the API config

After enabling, run:

```bash
npm run generate:data
```

This syncs `NEWSLETTER_ENABLED=true` to `api/.env.validation`, which the PHP backend reads.

### 3. Set up the newsletter secret

Generate a secret token for authenticating newsletter send requests:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to `api/.env`:

```
NEWSLETTER_SECRET="your-generated-64-char-hex-string"
```

This secret is never committed to version control. It authenticates your local send script against the server API.

### 4. Deploy

Build and deploy as normal. The subscriber storage directory (`api/storage/subscribers/`) will be created automatically on first subscription.

## Sending a newsletter

### 1. Write the newsletter

Create a plain text file with your newsletter content. You can use `{{firstName}}` and other tokens:

| Token | Replaced with |
| --- | --- |
| `{{firstName}}` | Subscriber's first name |
| `{{composerName}}` | Your composer name (from site config) |
| `{{siteUrl}}` | Your site URL |
| `{{unsubscribeLink}}` | The subscriber's personal unsubscribe link |

Example `newsletter.txt`:

```
Hi {{firstName}},

I'm excited to share that my new piece "Nocturne No. 2" has been published
and is now available for perusal on my website.

You can view the score here:
{{siteUrl}}/music/nocturne-no-2/

Thank you for your continued interest in my music.

Warmly,
{{composerName}}
```

### 2. Send it

```bash
node scripts/send-newsletter.mjs newsletter.txt
```

The script will:
1. Ask for a subject line
2. Show how many subscribers will receive it
3. Offer to send a **test email to yourself first** (recommended)
4. Ask for confirmation before sending to all subscribers

Newsletters are rendered using the same email template as your contact and perusal emails (dark header bar, brand logo footer, etc.), with an unsubscribe link added at the bottom.

### Rate limiting

The send endpoint is rate-limited to **one send per 15 minutes** to prevent accidental double-sends. Individual emails are sent with a 200ms delay between them to stay within SendGrid's rate limits.

## Subscriber management

### Where subscribers are stored

Subscribers are stored in `api/storage/subscribers/subscribers.json` on your server. This file is excluded from version control.

Each subscriber record includes:
- Email address
- First name
- Source (`contact` or `perusal`)
- Subscription date
- Unique unsubscribe token

### Viewing subscribers

```bash
# From your local machine (requires NEWSLETTER_SECRET in api/.env):
node scripts/send-newsletter.mjs --list
```

Or query the API directly:

```bash
curl -H "Authorization: Bearer YOUR_NEWSLETTER_SECRET" \
  https://your-site.com/api/newsletter/subscribers
```

### Deduplication

If the same email subscribes multiple times (e.g. via both the contact form and a perusal request), only one subscriber record is kept.

## Unsubscribe

Every newsletter email includes:

1. **Browser unsubscribe link** in the email footer that opens a confirmation page
2. **Email client native unsubscribe** (List-Unsubscribe header) for one-click unsubscribe in Gmail, Outlook, etc.
3. **RFC 8058 one-click POST** for email clients that support it

Unsubscribe is immediate and permanent. The subscriber is removed from the JSON file.

## Files reference

| File | Purpose |
| --- | --- |
| `source/site/newsletter.yaml` | Feature config (Keystatic-editable) |
| `src/utils/source-config/newsletter.ts` | Zod schema + config reader |
| `api/src/SubscriberManager.php` | File-based subscriber storage |
| `api/src/NewsletterHandler.php` | Send, list, and unsubscribe endpoints |
| `api/src/Mailer.php` | `sendNewsletter()` method |
| `scripts/send-newsletter.mjs` | Local CLI for sending newsletters |
| `api/storage/subscribers/` | Subscriber data (server-side, not committed) |

## Security

- The send and subscriber-list endpoints require a **Bearer token** (`NEWSLETTER_SECRET`) that only you have.
- Unsubscribe tokens are unique per subscriber (UUID v4).
- Token comparison uses `hash_equals()` to prevent timing attacks.
- The subscriber file uses file locking (`flock`) for safe concurrent access.
