<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * File-based form submission storage.
 *
 * Stores all form submissions (contact + perusal) in a single JSON file
 * (api/storage/submissions/submissions.json) with flock() for concurrent
 * access safety. Submissions are stored as a sequential array, newest first.
 */
final class SubmissionManager
{
    private string $filePath;

    public function __construct()
    {
        $dir = dirname(__DIR__) . '/storage/submissions';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $this->filePath = $dir . '/submissions.json';
    }

    /**
     * Add a new submission (prepended — newest first).
     *
     * @param string $type  Submission type ('contact' or 'perusal').
     * @param string $name  Submitter name.
     * @param string $email Submitter email.
     * @param array<string, mixed> $extra Additional fields (message, workId, newsletterOptIn).
     */
    public function add(string $type, string $name, string $email, array $extra = []): void
    {
        $submissions = $this->readFile();

        $submission = [
            'id'        => self::uuidV4(),
            'type'      => $type,
            'name'      => $name,
            'email'     => strtolower(trim($email)),
            'createdAt' => gmdate('Y-m-d\TH:i:s.v\Z'),
        ];

        // Merge extra fields (message, workId, newsletterOptIn).
        foreach ($extra as $key => $value) {
            $submission[$key] = $value;
        }

        // Prepend (newest first).
        array_unshift($submissions, $submission);

        $this->writeFile($submissions);
    }

    /**
     * Get all submissions.
     *
     * @return list<array<string, mixed>>
     */
    public function getAll(): array
    {
        return $this->readFile();
    }

    /**
     * Get a single submission by ID.
     *
     * @return array<string, mixed>|null
     */
    public function getById(string $id): ?array
    {
        foreach ($this->readFile() as $sub) {
            if (($sub['id'] ?? '') === $id) {
                return $sub;
            }
        }
        return null;
    }

    /**
     * Remove submissions by ID.
     *
     * @param string[] $ids Submission IDs to remove.
     * @return int Number of submissions removed.
     */
    public function removeByIds(array $ids): int
    {
        $submissions = $this->readFile();
        $idSet = array_flip($ids);
        $removed = 0;
        $remaining = [];

        foreach ($submissions as $sub) {
            if (isset($idSet[$sub['id'] ?? ''])) {
                $removed++;
            } else {
                $remaining[] = $sub;
            }
        }

        if ($removed > 0) {
            $this->writeFile($remaining);
        }

        return $removed;
    }

    // ── File I/O with flock ──────────────────────────────────────────────────

    /**
     * Read the submissions file with a shared lock.
     *
     * @return list<array<string, mixed>>
     */
    private function readFile(): array
    {
        if (!file_exists($this->filePath)) {
            return [];
        }

        $fp = fopen($this->filePath, 'r');
        if ($fp === false) {
            return [];
        }

        flock($fp, LOCK_SH);
        $raw = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        if ($raw === false || $raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        return is_array($data) ? array_values($data) : [];
    }

    /**
     * Write the submissions file atomically with an exclusive lock.
     *
     * @param list<array<string, mixed>> $submissions
     */
    private function writeFile(array $submissions): void
    {
        $json = json_encode($submissions, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $tmp = $this->filePath . '.tmp';

        $fp = fopen($tmp, 'w');
        if ($fp === false) {
            return;
        }

        flock($fp, LOCK_EX);
        fwrite($fp, $json);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        rename($tmp, $this->filePath);
    }

    /**
     * Generate a UUID v4 string.
     */
    private static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        // Set version 4 (0100) and variant 10.
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return sprintf(
            '%s-%s-%s-%s-%s',
            bin2hex(substr($bytes, 0, 4)),
            bin2hex(substr($bytes, 4, 2)),
            bin2hex(substr($bytes, 6, 2)),
            bin2hex(substr($bytes, 8, 2)),
            bin2hex(substr($bytes, 10, 6))
        );
    }
}
