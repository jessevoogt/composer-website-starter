<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Newsletter handler.
 *
 * POST /newsletter/send         → Send newsletter to all subscribers (Bearer token required).
 * GET  /newsletter/subscribers   → List subscriber count + masked emails (Bearer token required).
 * GET  /unsubscribe?token=xxx    → Show unsubscribe confirmation page.
 * POST /unsubscribe              → Process unsubscribe (browser form + RFC 8058 one-click).
 */
final class NewsletterHandler
{
    // ── Newsletter send ──────────────────────────────────────────────────────

    /**
     * Handle POST /newsletter/send.
     *
     * Required body: { "subject": "...", "body": "...", "testOnly": false }
     * Required header: Authorization: Bearer {NEWSLETTER_SECRET}
     *
     * @param array<string, mixed> $body Parsed JSON body.
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function send(array $body): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $subject  = trim((string) ($body['subject'] ?? ''));
        $bodyText = trim((string) ($body['body'] ?? ''));
        $testOnly = (bool) ($body['testOnly'] ?? false);

        if ($subject === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Subject is required.']];
        }

        if ($bodyText === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Body is required.']];
        }

        try {
            $mailer = new Mailer();
        } catch (\Exception) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Email service is not configured.']];
        }

        if ($testOnly) {
            // Send only to the site owner.
            $ownerEmail = $_ENV['CONTACT_RECIPIENT'] ?? $_ENV['FROM_EMAIL'] ?? '';
            if ($ownerEmail === '') {
                return ['status' => 500, 'body' => ['success' => false, 'message' => 'No recipient configured for test send.']];
            }

            $ownerName = $_ENV['COMPOSER_NAME'] ?? '';
            $sent = $mailer->sendNewsletter($ownerEmail, $ownerName, $subject, $bodyText, 'test-token-no-unsubscribe');
            return ['status' => 200, 'body' => [
                'success' => true,
                'testOnly' => true,
                'sent' => $sent ? 1 : 0,
                'failed' => $sent ? 0 : 1,
                'total' => 1,
            ]];
        }

        // Rate limit: 1 bulk newsletter send per 15 minutes (test sends are exempt).
        $clientIp = self::resolveClientIp();
        if (!RateLimit::check('newsletter-send', $clientIp, 1, 900)) {
            return ['status' => 429, 'body' => ['success' => false, 'message' => 'Rate limit: only one newsletter send per 15 minutes.']];
        }

        // Send to all subscribers.
        $manager = new SubscriberManager();
        $subscribers = $manager->getAll();

        if ($subscribers === []) {
            return ['status' => 200, 'body' => [
                'success' => true,
                'sent' => 0,
                'failed' => 0,
                'total' => 0,
                'message' => 'No subscribers.',
            ]];
        }

        $sent = 0;
        $failed = 0;
        $failures = [];
        $totalRecipients = count($subscribers);

        // Optionally CC the site owner (separate from subscriber list).
        $ccOwner = (bool) ($body['ccOwner'] ?? false);
        $ownerEmail = $_ENV['CONTACT_RECIPIENT'] ?? $_ENV['FROM_EMAIL'] ?? '';

        foreach ($subscribers as $sub) {
            $email = $sub['email'] ?? '';
            $name  = $sub['firstName'] ?? '';

            // Debug: force a real SendGrid failure by using an invalid email.
            $sendEmail = $email;
            if ($name === 'test_email_send_failure') {
                $sendEmail = 'not-a-valid-email';
            }

            $ok = $mailer->sendNewsletter(
                $sendEmail,
                $name,
                $subject,
                $bodyText,
                $sub['unsubscribeToken'] ?? '',
            );

            if ($ok) {
                $sent++;
            } else {
                $failed++;
                $failures[] = [
                    'email'  => $email,
                    'name'   => $name,
                    'reason' => $mailer->getLastSendError() ?: 'Unknown error',
                ];
            }

            // Brief pause between sends to avoid SendGrid rate limits.
            if ($sent + $failed < $totalRecipients) {
                usleep(200_000); // 200ms
            }
        }

        // Send owner copy after all subscriber emails.
        if ($ccOwner && $ownerEmail !== '') {
            usleep(200_000);
            $ownerName = $_ENV['COMPOSER_NAME'] ?? '';

            // Append failure report to the owner's copy if any sends failed.
            $ownerBody = $bodyText;
            if ($failures !== []) {
                $ownerBody .= "\n\n---\nNewsletter send report: {$failed} of {$totalRecipients} failed\n";
                foreach ($failures as $f) {
                    $ownerBody .= "\n- {$f['name']} ({$f['email']}): {$f['reason']}";
                }
            }

            $mailer->sendNewsletter($ownerEmail, $ownerName, $subject, $ownerBody, 'owner-copy-no-unsubscribe');
        }

        return ['status' => 200, 'body' => [
            'success' => true,
            'sent' => $sent,
            'failed' => $failed,
            'total' => $totalRecipients,
        ]];
    }

    // ── Subscriber list ──────────────────────────────────────────────────────

    /**
     * Handle GET /newsletter/subscribers.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function listSubscribers(): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $manager = new SubscriberManager();
        $subscribers = $manager->getAll();

        $list = [];
        foreach ($subscribers as $sub) {
            $email = $sub['email'] ?? '';

            // Always mask emails — use detail endpoint for single unmasked lookups.
            $parts = explode('@', $email, 2);
            $local = $parts[0];
            $domain = $parts[1] ?? '';
            $masked = substr($local, 0, 1) . str_repeat('*', max(3, strlen($local) - 1)) . '@' . $domain;

            $list[] = [
                'id' => SubscriberManager::subscriberId($email),
                'email' => $masked,
                'firstName' => $sub['firstName'] ?? '',
                'source' => $sub['source'] ?? '',
                'subscribedAt' => $sub['subscribedAt'] ?? '',
            ];
        }

        return ['status' => 200, 'body' => [
            'success' => true,
            'count' => count($list),
            'subscribers' => $list,
        ]];
    }

    // ── Subscriber detail (single) ─────────────────────────────────────────

    /**
     * Handle GET /newsletter/subscribers/detail?id=xxx.
     *
     * Returns full (unmasked) email and name for a single subscriber.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function subscriberDetail(): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'ID is required.']];
        }

        $manager = new SubscriberManager();
        $sub = $manager->getByHash($id);

        if ($sub === null) {
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'Subscriber not found.']];
        }

        return ['status' => 200, 'body' => [
            'success' => true,
            'id' => $id,
            'email' => $sub['email'] ?? '',
            'firstName' => $sub['firstName'] ?? '',
        ]];
    }

    // ── Delete subscribers ──────────────────────────────────────────────────

    /**
     * Handle POST /newsletter/subscribers/delete.
     *
     * Required body: { "ids": ["abc123...", ...] }
     *
     * @param array<string, mixed> $body
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function deleteSubscribers(array $body): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || $ids === []) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'No subscriber IDs provided.']];
        }

        $manager = new SubscriberManager();
        $removed = $manager->removeByIds($ids);

        return ['status' => 200, 'body' => ['success' => true, 'removed' => $removed]];
    }

    // ── Update subscriber ───────────────────────────────────────────────────

    /**
     * Handle POST /newsletter/subscribers/update.
     *
     * Required body: { "id": "abc123...", "email": "...", "firstName": "..." }
     *
     * @param array<string, mixed> $body
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function updateSubscriber(array $body): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $id = trim((string) ($body['id'] ?? ''));

        // Support partial updates: only send the field(s) you want to change.
        $newEmail = array_key_exists('email', $body) ? trim((string) $body['email']) : null;
        $newName = array_key_exists('firstName', $body) ? trim((string) $body['firstName']) : null;

        if ($id === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'ID is required.']];
        }

        if ($newEmail === null && $newName === null) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Nothing to update.']];
        }

        if ($newEmail !== null && $newEmail === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Email cannot be empty.']];
        }

        $manager = new SubscriberManager();
        $ok = $manager->updateByHash($id, $newEmail, $newName);

        if (!$ok) {
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'Subscriber not found or new email already exists.']];
        }

        return ['status' => 200, 'body' => ['success' => true]];
    }

    // ── Unsubscribe (GET — browser click from email link) ────────────────────

    /**
     * Handle GET /unsubscribe?token=xxx.
     *
     * Removes the subscriber and renders a simple HTML confirmation page.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function unsubscribe(): array
    {
        $token = trim((string) ($_GET['token'] ?? ''));

        if ($token === '') {
            return self::renderUnsubscribePage(false, 'Invalid unsubscribe link.');
        }

        $manager = new SubscriberManager();
        $removed = $manager->removeByToken($token);

        if ($removed) {
            return self::renderUnsubscribePage(true);
        }

        // Token not found — might already be unsubscribed.
        return self::renderUnsubscribePage(true, 'You have already been unsubscribed.');
    }

    // ── Unsubscribe (POST — RFC 8058 one-click or browser form) ──────────────

    /**
     * Handle POST /unsubscribe.
     *
     * Supports:
     * - RFC 8058 one-click: email client sends POST with List-Unsubscribe=One-Click
     *   and the token in the query string.
     * - Browser form: token in the POST body.
     *
     * @param array<string, mixed> $body Parsed body (may be empty for RFC 8058).
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function unsubscribePost(array $body): array
    {
        // Try token from query string first (RFC 8058), then from body.
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($token === '') {
            $token = trim((string) ($body['token'] ?? ''));
        }

        // RFC 8058 sends application/x-www-form-urlencoded, not JSON.
        // Check raw POST body if token still empty.
        if ($token === '') {
            $token = trim((string) ($_POST['token'] ?? ''));
        }

        if ($token === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Token is required.']];
        }

        $manager = new SubscriberManager();
        $manager->removeByToken($token);

        // Always return success (even if already unsubscribed) per RFC 8058.
        return ['status' => 200, 'body' => ['success' => true]];
    }

    // ── Unsubscribe confirmation page ────────────────────────────────────────

    /**
     * Render a simple HTML unsubscribe confirmation page and exit.
     *
     * @return never
     */
    private static function renderUnsubscribePage(bool $success, string $message = ''): array
    {
        $composerName = htmlspecialchars($_ENV['COMPOSER_NAME'] ?? '', ENT_QUOTES, 'UTF-8');
        $frontendUrl  = htmlspecialchars(rtrim($_ENV['FRONTEND_URL'] ?? '', '/'), ENT_QUOTES, 'UTF-8');

        $heading = $success ? 'Unsubscribed' : 'Error';
        $body = $message !== ''
            ? htmlspecialchars($message, ENT_QUOTES, 'UTF-8')
            : 'You have been unsubscribed and will no longer receive newsletter emails.';

        $statusCode = $success ? 200 : 400;

        http_response_code($statusCode);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');

        echo <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
          <title>{$heading} — {$composerName}</title>
          <style>
            body {
              margin: 0;
              padding: 2rem 1rem;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f4f4f5;
              color: #1a1a2e;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .card {
              max-width: 420px;
              width: 100%;
              background: #ffffff;
              border-radius: 4px;
              padding: 2.5rem 2rem;
              text-align: center;
            }
            h1 {
              margin: 0 0 0.75rem;
              font-size: 1.5rem;
              font-weight: 600;
              color: #18212b;
            }
            p {
              margin: 0 0 1.5rem;
              color: #4b5563;
              font-size: 0.95rem;
              line-height: 1.5;
            }
            a {
              color: #4b5563;
              text-decoration: underline;
            }
            a:hover {
              color: #18212b;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>{$heading}</h1>
            <p>{$body}</p>
            <a href="{$frontendUrl}/">Return to {$composerName}</a>
          </div>
        </body>
        </html>
        HTML;

        // Signal to index.php that we already sent the response.
        return ['status' => 0, 'body' => []];
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    /**
     * Validate the Authorization: Bearer header against NEWSLETTER_SECRET.
     */
    private static function validateAuth(): bool
    {
        $secret = $_ENV['NEWSLETTER_SECRET'] ?? '';
        if ($secret === '') {
            return false;
        }

        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($header, 'Bearer ')) {
            return false;
        }

        $provided = substr($header, 7);
        return hash_equals($secret, $provided);
    }

    /**
     * Resolve a stable client IP identifier.
     */
    private static function resolveClientIp(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        return $ip !== '' ? substr($ip, 0, 64) : 'unknown';
    }
}
