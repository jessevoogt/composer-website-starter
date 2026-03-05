<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * File-based rate limiter.
 *
 * Stores counters as small JSON files in storage/rate-limits/.
 * No database required. Each key gets its own file with a count and expiry.
 *
 * Files are cleaned up when accessed after expiry.
 */
final class RateLimit
{
    private static string $storageDir = '';

    /**
     * Get (and lazily create) the storage directory path.
     */
    private static function getStorageDir(): string
    {
        if (self::$storageDir === '') {
            self::$storageDir = dirname(__DIR__) . '/storage/rate-limits';
            if (!is_dir(self::$storageDir)) {
                mkdir(self::$storageDir, 0755, true);
            }
        }

        return self::$storageDir;
    }

    /**
     * Check if an action is rate-limited.
     *
     * @param string $namespace Action namespace (e.g., 'perusal', 'contact').
     * @param string $identifier Unique identifier (e.g., email address).
     * @param int    $maxAttempts Maximum attempts in the window.
     * @param int    $windowSeconds Time window in seconds.
     * @return bool True if the action is allowed, false if rate-limited.
     */
    public static function check(string $namespace, string $identifier, int $maxAttempts, int $windowSeconds): bool
    {
        $key  = md5($namespace . ':' . strtolower(trim($identifier)));
        $file = self::getStorageDir() . '/' . $key . '.json';

        $data = self::readFile($file);

        // Expired or missing → start fresh.
        if ($data === null || time() > $data['expires']) {
            self::writeFile($file, [
                'count'   => 1,
                'expires' => time() + $windowSeconds,
            ]);
            return true;
        }

        // Under limit → increment.
        if ($data['count'] < $maxAttempts) {
            $data['count']++;
            self::writeFile($file, $data);
            return true;
        }

        // Over limit.
        return false;
    }

    /**
     * Read a rate-limit file.
     *
     * @return array{count: int, expires: int}|null
     */
    private static function readFile(string $file): ?array
    {
        if (!file_exists($file)) {
            return null;
        }

        $raw = file_get_contents($file);
        if ($raw === false) {
            return null;
        }

        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['count'], $data['expires'])) {
            return null;
        }

        return [
            'count'   => (int) $data['count'],
            'expires' => (int) $data['expires'],
        ];
    }

    /**
     * Write a rate-limit file atomically.
     *
     * @param array{count: int, expires: int} $data
     */
    private static function writeFile(string $file, array $data): void
    {
        $json = json_encode($data);
        $tmp  = $file . '.tmp';

        if (file_put_contents($tmp, $json, LOCK_EX) !== false) {
            rename($tmp, $file);
        }
    }

    /**
     * Purge expired rate-limit files (housekeeping).
     *
     * Call this on a cron or periodically. Not required for correctness —
     * expired files are treated as fresh on next access.
     */
    public static function purgeExpired(): void
    {
        $dir = self::getStorageDir();
        $now = time();

        foreach (glob($dir . '/*.json') as $file) {
            $data = self::readFile($file);
            if ($data !== null && $now > $data['expires']) {
                @unlink($file);
            }
        }
    }
}
