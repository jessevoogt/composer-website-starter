<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * HMAC-SHA256 token utilities.
 *
 * Mirrors the TypeScript implementation in src/utils/perusal-token.ts exactly,
 * so tokens created by either side can be verified by the other.
 *
 * Token format: base64url(JSON payload) . "." . base64url(HMAC-SHA256 signature)
 * Payload:     { workId: string, email: string, firstName: string, exp: int }
 */
final class Token
{
    /**
     * Default dev key — must match the fallback in perusal-token.ts getHmacKey().
     * Only used when no secret is configured (insecure, development only).
     */
    private const DEFAULT_DEV_KEY = 'perusal-gate-default-dev-key';

    /**
     * Base64url-encode a raw string (RFC 4648 §5, no padding).
     */
    public static function encodeBase64Url(string $input): string
    {
        return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
    }

    /**
     * Base64url-decode a string.
     */
    public static function decodeBase64Url(string $input): string
    {
        $decoded = base64_decode(strtr($input, '-_', '+/'), true);
        return $decoded === false ? '' : $decoded;
    }

    /**
     * Resolve the HMAC key, falling back to the dev key if empty.
     */
    private static function resolveKey(string $secret): string
    {
        return $secret !== '' ? $secret : self::DEFAULT_DEV_KEY;
    }

    /**
     * Create a signed token from a payload array.
     *
     * @param array{workId: string, email: string, firstName: string, exp: int} $payload
     */
    public static function create(array $payload, string $secret): string
    {
        // Key order must match JS: { workId, email, firstName, exp }
        $json       = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $payloadB64 = self::encodeBase64Url($json);

        $key    = self::resolveKey($secret);
        $sig    = hash_hmac('sha256', $payloadB64, $key, true);
        $sigB64 = self::encodeBase64Url($sig);

        return $payloadB64 . '.' . $sigB64;
    }

    /**
     * Parse the payload from a token without verifying the signature.
     *
     * @return array{workId: string, email: string, firstName: string, exp: int}|null
     */
    public static function parsePayload(string $token): ?array
    {
        $dotPos = strrpos($token, '.');
        if ($dotPos === false || $dotPos === 0) {
            return null;
        }

        $decoded = self::decodeBase64Url(substr($token, 0, $dotPos));
        if ($decoded === '') {
            return null;
        }

        $parsed = json_decode($decoded, true);
        if (!is_array($parsed)) {
            return null;
        }

        if (
            !isset($parsed['workId'], $parsed['email'], $parsed['exp']) ||
            !is_string($parsed['workId']) ||
            !is_string($parsed['email']) ||
            !is_numeric($parsed['exp'])
        ) {
            return null;
        }

        $parsed['exp'] = (int) $parsed['exp'];

        return $parsed;
    }

    /**
     * Verify a token's HMAC signature, expiry, and workId binding.
     *
     * @return array{valid: bool, payload?: array{workId: string, email: string, firstName: string, exp: int}}
     */
    public static function verify(string $token, string $workId, string $secret): array
    {
        $dotPos = strrpos($token, '.');
        if ($dotPos === false || $dotPos === 0) {
            return ['valid' => false];
        }

        $payloadB64 = substr($token, 0, $dotPos);
        $sigB64     = substr($token, $dotPos + 1);

        // Verify HMAC.
        $key         = self::resolveKey($secret);
        $computedSig = self::encodeBase64Url(hash_hmac('sha256', $payloadB64, $key, true));

        if (!hash_equals($computedSig, $sigB64)) {
            return ['valid' => false];
        }

        $payload = self::parsePayload($token);
        if ($payload === null) {
            return ['valid' => false];
        }

        // Check workId binding.
        if ($payload['workId'] !== $workId) {
            return ['valid' => false];
        }

        // Check expiry (exp is in milliseconds, matching JS Date.now()).
        $nowMs = (int) (microtime(true) * 1000);
        if ($nowMs > $payload['exp']) {
            return ['valid' => false];
        }

        return ['valid' => true, 'payload' => $payload];
    }

    /**
     * Build a token payload with the configured expiration.
     *
     * @return array{workId: string, email: string, firstName: string, exp: int}
     */
    public static function makePayload(string $workId, string $email, string $firstName, int $expDays = 90): array
    {
        $expMs = (int) (microtime(true) * 1000) + ($expDays * 24 * 60 * 60 * 1000);

        return [
            'workId'    => $workId,
            'email'     => strtolower(trim($email)),
            'firstName' => $firstName,
            'exp'       => $expMs,
        ];
    }

    /**
     * Hash an email to an 8-char hex string for analytics.
     * Matches hashEmail() in perusal-token.ts.
     */
    public static function hashEmail(string $email): string
    {
        return substr(hash('sha256', strtolower(trim($email))), 0, 8);
    }
}
