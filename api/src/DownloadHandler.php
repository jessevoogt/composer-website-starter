<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Secure PDF score download handler.
 *
 * GET /download-score?token=xxx&type=watermarked
 * GET /download-score?token=xxx&type=original
 * GET /download-score?work=slug&type=watermarked   (ungated only)
 *
 * Validates tokens and gating, then streams the PDF from private_html.
 * Returns a special response format: status=0 means "response already sent".
 */
final class DownloadHandler
{
    /** Valid PDF types. */
    private const VALID_TYPES = ['watermarked', 'original'];

    /**
     * Handle GET /download-score.
     *
     * @return array{status: int, body: array<string, mixed>|null}
     */
    public static function handle(): array
    {
        $token  = trim((string) ($_GET['token'] ?? ''));
        $type   = trim((string) ($_GET['type'] ?? ''));
        $workId = trim((string) ($_GET['work'] ?? ''));

        // Validate type parameter.
        if (!in_array($type, self::VALID_TYPES, true)) {
            return self::jsonError(400, 'Invalid type. Must be "watermarked" or "original".');
        }

        // Load PDF manifest.
        $manifest = self::loadManifest();
        if ($manifest === null) {
            return self::jsonError(500, 'PDF manifest not found.');
        }

        $secret = $_ENV['HMAC_SECRET'] ?? '';

        // ── Token-based access (gated) ──────────────────────────────────────
        if ($token !== '') {
            // Parse the token to extract workId.
            $payload = Token::parsePayload($token);
            if ($payload === null) {
                return self::jsonError(401, 'Invalid token.');
            }

            $tokenWorkId = $payload['workId'];

            // Verify the full token (signature + expiry + work binding).
            try {
                $result = Token::verify($token, $tokenWorkId, $secret);
            } catch (\RuntimeException) {
                return self::jsonError(500, 'Perusal token signing secret is not configured.');
            }
            if (!$result['valid']) {
                return self::jsonError(401, 'Token is invalid or expired.');
            }

            $workId = $tokenWorkId;
        } elseif ($workId !== '') {
            // ── Ungated access ──────────────────────────────────────────────
            $workEntry = $manifest[$workId] ?? null;
            if ($workEntry === null) {
                return self::jsonError(404, 'Work not found.');
            }

            // Check that this PDF type is ungated for this work.
            $gatedKey = $type === 'watermarked' ? 'watermarkedGated' : 'originalGated';
            if (!empty($workEntry[$gatedKey])) {
                return self::jsonError(401, 'Authentication required for this download.');
            }
        } else {
            return self::jsonError(400, 'Either token or work parameter is required.');
        }

        // Verify work exists in manifest.
        $workEntry = $manifest[$workId] ?? null;
        if ($workEntry === null) {
            return self::jsonError(404, 'Work not found.');
        }

        // Verify this PDF type is available for this work.
        $hasKey = $type === 'watermarked' ? 'hasWatermarkedPdf' : 'hasOriginalPdf';
        if (empty($workEntry[$hasKey])) {
            return self::jsonError(404, 'This PDF type is not available for this work.');
        }

        // Rate limit: 20 downloads per token/work per hour.
        $rateLimitKey = $token !== '' ? substr(hash('sha256', $token), 0, 16) : $workId;
        $rateLimit = (int) ($_ENV['RATE_LIMIT_DOWNLOAD'] ?? 20);
        if (!RateLimit::check('download', $rateLimitKey, $rateLimit, 3600)) {
            return self::jsonError(429, 'Too many download requests. Please try again later.');
        }

        // Resolve file path.
        $scoresPath = $_ENV['PRIVATE_SCORES_PATH'] ?? '';
        if ($scoresPath === '') {
            return self::jsonError(500, 'Private scores path is not configured.');
        }

        $filename = $type === 'watermarked' ? 'score-watermarked.pdf' : 'score-original.pdf';
        $filePath = rtrim($scoresPath, '/') . '/' . $workId . '/' . $filename;

        if (!is_file($filePath)) {
            return self::jsonError(404, 'PDF file not found on server.');
        }

        // Build human-friendly download filenames from the configurable template.
        // ASCII version: accents transliterated (è→e), spaces preserved.
        // Unicode version: original accented characters preserved.
        [$asciiName, $unicodeName] = self::resolveDownloadFilename($workEntry, $type);

        // Stream the file.
        self::streamFile($filePath, $asciiName, $unicodeName);

        // Signal to the router that the response was already sent.
        return ['status' => 0, 'body' => null];
    }

    /**
     * Load the PDF scores manifest.
     *
     * @return array<string, array<string, mixed>>|null
     */
    private static function loadManifest(): ?array
    {
        $path = dirname(__DIR__) . '/pdf-scores.json';
        if (!is_file($path)) {
            return null;
        }

        $json = file_get_contents($path);
        if ($json === false) {
            return null;
        }

        $parsed = json_decode($json, true);
        return is_array($parsed) ? $parsed : null;
    }

    /**
     * Stream a file to the client with appropriate headers.
     *
     * Uses both `filename` (ASCII fallback) and `filename*` (RFC 5987 UTF-8)
     * in Content-Disposition so modern browsers show the original Unicode name
     * while older clients get a readable transliterated ASCII version.
     *
     * @param string $filePath      Absolute path to the PDF on disk
     * @param string $asciiName     Transliterated ASCII filename (e.g. "Apres un Reve.pdf")
     * @param string $unicodeName   Original Unicode filename (e.g. "Après un Rêve.pdf")
     */
    private static function streamFile(string $filePath, string $asciiName, string $unicodeName): void
    {
        $size = filesize($filePath);

        // Build Content-Disposition with dual filename parameters.
        // filename="..." is the ASCII fallback (safe everywhere).
        // filename*=UTF-8''... is the RFC 5987 UTF-8 version (modern browsers prefer this).
        $disposition = 'attachment; filename="' . $asciiName . '"';
        if ($unicodeName !== $asciiName) {
            $disposition .= "; filename*=UTF-8''" . rawurlencode($unicodeName);
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: ' . $disposition);
        header('Content-Length: ' . $size);
        header('Cache-Control: no-store');
        header('Referrer-Policy: no-referrer');
        header('X-Content-Type-Options: nosniff');

        // Flush output buffer to prevent memory issues with large files.
        if (ob_get_level()) {
            ob_end_clean();
        }

        readfile($filePath);
    }

    /**
     * Build a JSON error response.
     *
     * @return array{status: int, body: array{error: string}}
     */
    private static function jsonError(int $status, string $message): array
    {
        return ['status' => $status, 'body' => ['error' => $message]];
    }

    /**
     * Resolve the download filename from the configurable template + work metadata.
     *
     * Returns two versions:
     * - ASCII: accents transliterated to ASCII equivalents, spaces preserved
     * - Unicode: original accented characters preserved, spaces preserved
     *
     * Both versions go through the same cleanup pipeline (trim, collapse, max length).
     * The ASCII version is used for the `filename` Content-Disposition parameter,
     * the Unicode version for the `filename*` RFC 5987 parameter.
     *
     * @param array<string, mixed> $workEntry  Work metadata from the manifest
     * @param string               $type       'watermarked' or 'original'
     * @return array{0: string, 1: string}  [asciiFilename, unicodeFilename] with .pdf extension
     */
    private static function resolveDownloadFilename(array $workEntry, string $type): array
    {
        $template = $_ENV['DOWNLOAD_FILENAME_FORMAT'] ?? '';
        if ($template === '') {
            $template = '{{composerName}} -- {{workTitle}} {{workSubtitle}} -- {{suffix}}';
        }

        // Resolve suffix based on PDF type.
        $suffix = $type === 'watermarked'
            ? ($_ENV['DOWNLOAD_WATERMARKED_SUFFIX'] ?? 'PERUSAL SCORE')
            : ($_ENV['DOWNLOAD_ORIGINAL_SUFFIX'] ?? '');

        // Build token map from manifest metadata.
        $instrumentation = $workEntry['instrumentation'] ?? [];
        $instrumentationStr = is_array($instrumentation) ? implode(', ', $instrumentation) : '';

        $tokens = [
            '{{composerName}}'    => (string) ($workEntry['composerName'] ?? ''),
            '{{workTitle}}'       => (string) ($workEntry['title'] ?? ''),
            '{{workSubtitle}}'    => (string) ($workEntry['subtitle'] ?? ''),
            '{{instrumentation}}' => $instrumentationStr,
            '{{downloadDate}}'    => date('Y-m-d'),
            '{{suffix}}'          => $suffix,
        ];

        $raw = str_replace(array_keys($tokens), array_values($tokens), $template);

        // Build both versions from the same raw string.
        $ascii   = self::cleanupFilename(self::sanitizeFilenameAscii($raw));
        $unicode = self::cleanupFilename(self::sanitizeFilenameUnicode($raw));

        return [$ascii . '.pdf', $unicode . '.pdf'];
    }

    /**
     * Common cleanup pipeline applied to both ASCII and Unicode filenames.
     *
     * Trims trailing whitespace/hyphens, collapses runs, enforces max length.
     */
    private static function cleanupFilename(string $filename): string
    {
        // Trim trailing whitespace and hyphens (handles empty trailing tokens).
        $filename = rtrim($filename, " \t\n\r\0\x0B-");

        // Collapse 3+ consecutive hyphens (preserves intentional -- separators).
        $filename = (string) preg_replace('/-{3,}/', '--', $filename);

        // Collapse multiple consecutive spaces.
        $filename = (string) preg_replace('/ {2,}/', ' ', $filename);

        // Trim leading/trailing hyphens.
        $filename = trim($filename, '-');

        // Trim leading/trailing whitespace.
        $filename = trim($filename);

        // Enforce max length (200 chars before .pdf).
        if (mb_strlen($filename, 'UTF-8') > 200) {
            $filename = rtrim(mb_substr($filename, 0, 200, 'UTF-8'), '- ');
        }

        return $filename !== '' ? $filename : 'score';
    }

    /**
     * Transliterate accents to ASCII and strip remaining non-ASCII characters.
     *
     * Preserves spaces (they are safe in quoted Content-Disposition filenames).
     */
    private static function sanitizeFilenameAscii(string $value): string
    {
        // Transliterate accented characters to ASCII equivalents (è→e, ü→u, etc.).
        $value = self::transliterateToAscii($value);

        // Strip characters not safe for filenames. Keep: a-z, A-Z, 0-9, space, hyphen, underscore.
        $safe = (string) preg_replace('/[^a-zA-Z0-9 \-_]/', '', $value);

        // Collapse multiple spaces.
        $safe = (string) preg_replace('/ {2,}/', ' ', trim($safe));

        return $safe !== '' ? $safe : 'score';
    }

    /**
     * Sanitize for Unicode filename: keep letters/digits/accents, strip only
     * filesystem-unsafe characters.
     *
     * Preserves spaces and accented characters for the filename* RFC 5987 parameter.
     */
    private static function sanitizeFilenameUnicode(string $value): string
    {
        // Strip filesystem-unsafe characters: / \ : * ? " < > |
        // Also strip control characters (U+0000–U+001F, U+007F).
        $safe = (string) preg_replace('/[\/\\\\:*?"<>|\x00-\x1f\x7f]/', '', $value);

        // Strip commas (from instrumentation join) — they're technically safe but
        // can cause issues in Content-Disposition header parsing.
        $safe = str_replace(',', '', $safe);

        // Collapse multiple spaces.
        $safe = (string) preg_replace('/ {2,}/', ' ', trim($safe));

        return $safe !== '' ? $safe : 'score';
    }

    /**
     * Transliterate accented/diacritical characters to their ASCII equivalents.
     *
     * Uses PHP intl Transliterator when available (most reliable), falls back to
     * Normalizer (NFD decomposition + strip combining marks), then to a manual
     * lookup table for common Latin diacriticals.
     */
    private static function transliterateToAscii(string $value): string
    {
        // Prefer the intl Transliterator (most comprehensive).
        if (function_exists('transliterator_transliterate')) {
            $result = transliterator_transliterate('Any-Latin; Latin-ASCII', $value);
            if ($result !== false) {
                return $result;
            }
        }

        // Fallback: NFD normalization + strip combining marks (also requires intl).
        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize($value, \Normalizer::FORM_D);
            if ($normalized !== false) {
                // Strip Unicode combining diacritical marks (U+0300–U+036F).
                return (string) preg_replace('/\pM/u', '', $normalized);
            }
        }

        // Last resort: manual lookup table for common Latin diacriticals.
        return strtr($value, [
            'À' => 'A', 'Á' => 'A', 'Â' => 'A', 'Ã' => 'A', 'Ä' => 'A', 'Å' => 'A',
            'Æ' => 'AE', 'Ç' => 'C', 'È' => 'E', 'É' => 'E', 'Ê' => 'E', 'Ë' => 'E',
            'Ì' => 'I', 'Í' => 'I', 'Î' => 'I', 'Ï' => 'I', 'Ð' => 'D', 'Ñ' => 'N',
            'Ò' => 'O', 'Ó' => 'O', 'Ô' => 'O', 'Õ' => 'O', 'Ö' => 'O', 'Ø' => 'O',
            'Ù' => 'U', 'Ú' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ý' => 'Y', 'Þ' => 'Th',
            'ß' => 'ss',
            'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a',
            'æ' => 'ae', 'ç' => 'c', 'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
            'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ð' => 'd', 'ñ' => 'n',
            'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o',
            'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ý' => 'y', 'þ' => 'th',
            'ÿ' => 'y',
        ]);
    }
}
