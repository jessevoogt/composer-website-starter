<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Perusal score access gating request handler.
 *
 * POST /request-access -> validate, create token, send magic-link email.
 * POST /verify-token   -> verify HMAC signature, expiry, and work binding.
 */
final class PerusalHandler
{
    /**
     * Handle POST /request-access.
     *
     * @param array<string, mixed> $body Parsed JSON body.
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function requestAccess(array $body): array
    {
        // Honeypot — silently accept if filled.
        if (!empty($body['website'] ?? '')) {
            return ['status' => 200, 'body' => ['success' => true]];
        }

        // Validate required fields.
        $firstName = trim((string) ($body['firstName'] ?? ''));
        $email     = strtolower(trim((string) ($body['email'] ?? '')));
        $workId    = trim((string) ($body['workId'] ?? ''));

        if ($firstName === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'First name is required.']];
        }

        $nameMax = (int) ($_ENV['PERUSAL_NAME_MAX_LENGTH'] ?? 120);
        if (mb_strlen($firstName) > $nameMax) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Name is too long.']];
        }

        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'A valid email address is required.']];
        }

        if ($workId === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Work ID is required.']];
        }

        // Rate limiting.
        $clientIp = self::resolveClientIp();
        $rateLimit = (int) ($_ENV['RATE_LIMIT_PERUSAL'] ?? 5);
        $ipRateLimit = max($rateLimit * 6, 30);
        if (
            !RateLimit::check('perusal-email', $email, $rateLimit, 3600) ||
            !RateLimit::check('perusal-ip', $clientIp, $ipRateLimit, 3600)
        ) {
            return ['status' => 429, 'body' => ['success' => false, 'message' => 'Too many requests. Please try again later.']];
        }

        // Build token.
        $secret  = $_ENV['HMAC_SECRET'] ?? '';
        $expDays = (int) ($_ENV['TOKEN_EXP_DAYS'] ?? 90);
        try {
            $payload = Token::makePayload($workId, $email, $firstName, $expDays);
            $token   = Token::create($payload, $secret);
        } catch (\RuntimeException) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Perusal token signing secret is not configured.']];
        }

        // Build magic link.
        $frontendUrl = rtrim($_ENV['FRONTEND_URL'] ?? '', '/');
        $magicLink   = $frontendUrl . '/music/' . rawurlencode($workId) . '/perusal-score/?token=' . rawurlencode($token);

        // Resolve work metadata from manifest (title, subtitle).
        $workEntry    = self::loadWorkEntry($workId);
        $workTitle    = $workEntry['title'] ?? ucwords(str_replace('-', ' ', $workId));
        $workSubtitle = $workEntry['subtitle'] ?? '';

        // Build PDF download links from manifest entry.
        $pdfLinks = self::buildPdfLinksFromEntry($workEntry, $token);

        // Send email (templates loaded from api/email-templates.json).
        try {
            $mailer = new Mailer();
            $sent   = $mailer->sendMagicLink(
                $email,
                $firstName,
                $magicLink,
                $workTitle,
                $workId,
                $expDays,
                $pdfLinks,
            );
        } catch (\Exception) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Email service is not configured.']];
        }

        if (!$sent) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Failed to send the access link email. Please try again.']];
        }

        // Notify the site owner (fire-and-forget — don't fail the request).
        try {
            $newsletterOptIn = ($body['newsletter'] ?? '') === 'true';
            $mailer->sendPerusalNotification($email, $firstName, $workTitle, $workSubtitle, $workId, $newsletterOptIn);
        } catch (\Exception) {
            // Silently ignore — the magic link was already sent successfully.
        }

        // Build submission metadata from client + server sources.
        $meta = SubmissionMeta::build($body);

        // Store submission for admin review (non-blocking).
        try {
            $submissions = new SubmissionManager();
            $submissions->add('perusal', $firstName, $email, [
                'workId'          => $workId,
                'newsletterOptIn' => $newsletterOptIn,
                'meta'           => $meta,
            ]);
        } catch (\Exception $e) {
            error_log('[PerusalHandler] submission storage error: ' . $e->getMessage());
        }

        // Newsletter opt-in (non-blocking — subscription failure doesn't affect the response).
        $newsletterField = $body['newsletter'] ?? '';
        $newsletterEnabled = $_ENV['NEWSLETTER_ENABLED'] ?? '';

        if ($newsletterField === 'true' && $newsletterEnabled === 'true') {
            try {
                $manager = new SubscriberManager();
                $manager->add($email, $firstName, 'perusal');
            } catch (\Exception $e) {
                error_log('[PerusalHandler] subscriber add error: ' . $e->getMessage());
            }
        }

        return ['status' => 200, 'body' => ['success' => true]];
    }

    /**
     * Handle POST /verify-token.
     *
     * @param array<string, mixed> $body Parsed JSON body.
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function verifyToken(array $body): array
    {
        $token  = (string) ($body['token'] ?? '');
        $workId = (string) ($body['workId'] ?? '');
        $secret = $_ENV['HMAC_SECRET'] ?? '';

        if ($token === '' || $workId === '') {
            return ['status' => 200, 'body' => ['valid' => false]];
        }

        try {
            $result = Token::verify($token, $workId, $secret);
        } catch (\RuntimeException) {
            return ['status' => 200, 'body' => ['valid' => false]];
        }

        if ($result['valid']) {
            return ['status' => 200, 'body' => [
                'valid' => true,
                'email' => $result['payload']['email'] ?? '',
            ]];
        }

        return ['status' => 200, 'body' => ['valid' => false]];
    }

    /**
     * Load a work entry from the pdf-scores.json manifest.
     *
     * @return array<string, mixed> The work entry, or empty array if not found.
     */
    private static function loadWorkEntry(string $workId): array
    {
        $manifestPath = dirname(__DIR__) . '/pdf-scores.json';
        if (!is_file($manifestPath)) {
            return [];
        }

        $json = file_get_contents($manifestPath);
        if ($json === false) {
            return [];
        }

        $manifest = json_decode($json, true);
        if (!is_array($manifest)) {
            return [];
        }

        $entry = $manifest[$workId] ?? null;
        return is_array($entry) ? $entry : [];
    }

    /**
     * Build PDF download URLs from a pre-loaded work entry.
     *
     * @param array<string, mixed> $workEntry Work entry from loadWorkEntry().
     * @return array<string, string> Map of type → download URL ('watermarked' and/or 'original').
     */
    private static function buildPdfLinksFromEntry(array $workEntry, string $token): array
    {
        if ($workEntry === []) {
            return [];
        }

        $apiEndpoint = rtrim($_ENV['API_ENDPOINT'] ?? '', '/');
        if ($apiEndpoint === '') {
            $apiEndpoint = rtrim($_ENV['FRONTEND_URL'] ?? '', '/') . '/api';
        }

        $links = [];

        if (!empty($workEntry['hasWatermarkedPdf'])) {
            $links['watermarked'] = $apiEndpoint . '/download-score?token=' . rawurlencode($token) . '&type=watermarked';
        }

        if (!empty($workEntry['hasOriginalPdf'])) {
            $links['original'] = $apiEndpoint . '/download-score?token=' . rawurlencode($token) . '&type=original';
        }

        return $links;
    }

    /**
     * Resolve a stable client IP identifier for rate limiting.
     */
    private static function resolveClientIp(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        return $ip !== '' ? substr($ip, 0, 64) : 'unknown';
    }
}
