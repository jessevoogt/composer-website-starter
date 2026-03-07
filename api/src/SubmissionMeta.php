<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Builds submission metadata from client-side + server-side sources.
 *
 * Client meta arrives as a JSON-encoded `_meta` field in the POST body.
 * Server meta (IP, UA, geolocation) is derived from $_SERVER.
 */
final class SubmissionMeta
{
    /** Client-side keys we accept (whitelist to prevent unexpected fields). */
    private const ALLOWED_CLIENT_KEYS = [
        'pageUrl',
        'language',
        'prefersReducedMotion',
        'screenWidth',
        'screenHeight',
        'viewportWidth',
        'viewportHeight',
        'referrer',
        'journey',
    ];

    /**
     * Build the combined metadata array.
     *
     * @param array<string, mixed> $body The parsed POST body (may contain `_meta`).
     * @return array<string, mixed> The metadata to store in the submission record.
     */
    public static function build(array $body): array
    {
        // ── Client-side metadata ─────────────────────────────────
        $clientMeta = [];
        $rawClientMeta = $body['_meta'] ?? '';
        if (is_string($rawClientMeta) && $rawClientMeta !== '') {
            $decoded = json_decode($rawClientMeta, true);
            if (is_array($decoded)) {
                $clientMeta = $decoded;
            }
        }

        // ── Server-side metadata ─────────────────────────────────
        $ip = self::resolveIp();
        $ua = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        $parsed = $ua !== '' ? UserAgentParser::parse($ua) : ['browser' => '', 'os' => ''];

        // ── Geolocation (best-effort, 2s timeout) ────────────────
        $geo = GeoLookup::lookup($ip);

        // ── Assemble ─────────────────────────────────────────────
        $meta = [];

        // Client fields (whitelisted).
        foreach (self::ALLOWED_CLIENT_KEYS as $key) {
            if (array_key_exists($key, $clientMeta)) {
                $meta[$key] = $clientMeta[$key];
            }
        }

        // Server fields.
        $meta['ip'] = $ip;
        if ($ua !== '') {
            $meta['userAgent'] = $ua;
            $meta['browser']   = $parsed['browser'];
            $meta['os']        = $parsed['os'];
        }

        // Geolocation fields.
        foreach ($geo as $geoKey => $geoValue) {
            $meta[$geoKey] = $geoValue;
        }

        return $meta;
    }

    /**
     * Resolve client IP address.
     */
    private static function resolveIp(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        return $ip !== '' ? substr($ip, 0, 64) : 'unknown';
    }
}
