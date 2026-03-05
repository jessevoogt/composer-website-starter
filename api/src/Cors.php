<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * CORS handling.
 *
 * Reads allowed origins from the ALLOWED_ORIGINS env var (comma-separated).
 * Validates the Origin header and sends appropriate CORS response headers.
 */
final class Cors
{
    /**
     * Get the list of allowed origins from configuration.
     *
     * @return string[]
     */
    private static function getAllowedOrigins(): array
    {
        $raw = $_ENV['ALLOWED_ORIGINS'] ?? '';
        if ($raw === '') {
            return [];
        }

        return array_filter(array_map('trim', explode(',', $raw)));
    }

    /**
     * Check if the given Origin is allowed.
     */
    private static function isAllowed(string $origin): bool
    {
        $allowed = self::getAllowedOrigins();
        if (empty($allowed)) {
            return false;
        }

        if (in_array('*', $allowed, true)) {
            return true;
        }

        $origin = rtrim($origin, '/');
        foreach ($allowed as $item) {
            if (rtrim($item, '/') === $origin) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle a preflight OPTIONS request.
     *
     * If the current request is OPTIONS and the origin is allowed,
     * sends CORS headers and exits immediately.
     */
    public static function handlePreflight(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS') {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin === '' || !self::isAllowed($origin)) {
            http_response_code(403);
            exit;
        }

        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
        header('Vary: Origin');
        header('Content-Length: 0');
        header('Content-Type: text/plain');
        http_response_code(204);
        exit;
    }

    /**
     * Add CORS response headers for the current request.
     *
     * Call this before sending any JSON response body.
     */
    public static function addHeaders(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin === '' || !self::isAllowed($origin)) {
            return;
        }

        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Vary: Origin');
    }
}
