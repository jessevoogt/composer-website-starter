<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * File-based newsletter subscriber storage.
 *
 * Stores all subscribers in a single JSON file (api/storage/subscribers.json)
 * with flock() for concurrent access safety. Subscribers are keyed by lowercase
 * email for deduplication. Each subscriber gets a UUID v4 unsubscribe token.
 */
final class SubscriberManager
{
    private string $filePath;

    public function __construct()
    {
        $dir = dirname(__DIR__) . '/storage/subscribers';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $this->filePath = $dir . '/subscribers.json';
    }

    /**
     * Get all active subscribers.
     *
     * @return array<string, array{email: string, firstName: string, source: string, subscribedAt: string, unsubscribeToken: string}>
     */
    public function getAll(): array
    {
        return $this->readFile();
    }

    /**
     * Get the number of active subscribers.
     */
    public function count(): int
    {
        return count($this->readFile());
    }

    /**
     * Add a subscriber (or update name/source if already subscribed).
     *
     * @param string $email      Subscriber email (lowercased internally).
     * @param string $firstName  Subscriber first name.
     * @param string $source     Subscription source ('contact' or 'perusal').
     * @return array{added: bool, subscriber: array<string, string>}
     */
    public function add(string $email, string $firstName, string $source): array
    {
        $email = strtolower(trim($email));
        $key = $email;

        $subscribers = $this->readFile();

        if (isset($subscribers[$key])) {
            return ['added' => false, 'subscriber' => $subscribers[$key]];
        }

        $subscriber = [
            'email'            => $email,
            'firstName'        => $firstName,
            'source'           => $source,
            'subscribedAt'     => gmdate('Y-m-d\TH:i:s.v\Z'),
            'unsubscribeToken' => self::uuidV4(),
        ];

        $subscribers[$key] = $subscriber;
        $this->writeFile($subscribers);

        return ['added' => true, 'subscriber' => $subscriber];
    }

    /**
     * Remove a subscriber by their unsubscribe token.
     *
     * @return bool True if a subscriber was found and removed.
     */
    public function removeByToken(string $token): bool
    {
        if ($token === '') {
            return false;
        }

        $subscribers = $this->readFile();
        $found = false;

        foreach ($subscribers as $key => $sub) {
            if (hash_equals($sub['unsubscribeToken'] ?? '', $token)) {
                unset($subscribers[$key]);
                $found = true;
                break;
            }
        }

        if ($found) {
            $this->writeFile($subscribers);
        }

        return $found;
    }

    /**
     * Derive a short, stable ID from an email address.
     *
     * Used to reference subscribers in the admin UI without exposing emails.
     */
    public static function subscriberId(string $email): string
    {
        return substr(hash('sha256', strtolower(trim($email))), 0, 12);
    }

    /**
     * Find a subscriber by their derived hash ID.
     *
     * @return array<string, string>|null The full subscriber record, or null.
     */
    public function getByHash(string $hash): ?array
    {
        foreach ($this->readFile() as $sub) {
            if (self::subscriberId($sub['email'] ?? '') === $hash) {
                return $sub;
            }
        }
        return null;
    }

    /**
     * Remove subscriber(s) by hash ID.
     *
     * @param string[] $ids Hash IDs to remove.
     * @return int Number of subscribers removed.
     */
    public function removeByIds(array $ids): int
    {
        $subscribers = $this->readFile();
        $idSet = array_flip($ids);
        $removed = 0;

        foreach ($subscribers as $key => $sub) {
            $hash = self::subscriberId($sub['email'] ?? '');
            if (isset($idSet[$hash])) {
                unset($subscribers[$key]);
                $removed++;
            }
        }

        if ($removed > 0) {
            $this->writeFile($subscribers);
        }

        return $removed;
    }

    /**
     * Remove subscriber(s) by email address.
     *
     * @param string[] $emails Email addresses to remove.
     * @return int Number of subscribers removed.
     */
    public function removeByEmails(array $emails): int
    {
        $subscribers = $this->readFile();
        $removed = 0;

        foreach ($emails as $email) {
            $key = strtolower(trim($email));
            if (isset($subscribers[$key])) {
                unset($subscribers[$key]);
                $removed++;
            }
        }

        if ($removed > 0) {
            $this->writeFile($subscribers);
        }

        return $removed;
    }

    /**
     * Update a subscriber identified by hash ID.
     *
     * @return bool True if the subscriber was found and updated.
     */
    public function updateByHash(string $hash, ?string $newEmail, ?string $newName): bool
    {
        $subscribers = $this->readFile();

        // Find the subscriber by hash.
        $foundKey = null;
        foreach ($subscribers as $key => $sub) {
            if (self::subscriberId($sub['email'] ?? '') === $hash) {
                $foundKey = $key;
                break;
            }
        }

        if ($foundKey === null) {
            return false;
        }

        $sub = $subscribers[$foundKey];

        if ($newName !== null) {
            $sub['firstName'] = $newName;
        }

        if ($newEmail !== null) {
            $newKey = strtolower(trim($newEmail));
            if ($newKey !== $foundKey) {
                if (isset($subscribers[$newKey])) {
                    return false; // New email already exists.
                }
                unset($subscribers[$foundKey]);
                $sub['email'] = $newKey;
                $subscribers[$newKey] = $sub;
            } else {
                $subscribers[$foundKey] = $sub;
            }
        } else {
            $subscribers[$foundKey] = $sub;
        }

        $this->writeFile($subscribers);
        return true;
    }

    /**
     * Update a subscriber's name and/or email.
     *
     * @return bool True if the subscriber was found and updated.
     */
    public function update(string $originalEmail, string $newEmail, string $newName): bool
    {
        $subscribers = $this->readFile();
        $key = strtolower(trim($originalEmail));

        if (!isset($subscribers[$key])) {
            return false;
        }

        $sub = $subscribers[$key];
        $sub['firstName'] = $newName;

        $newKey = strtolower(trim($newEmail));
        if ($newKey !== $key) {
            // Email changed — re-key the entry.
            if (isset($subscribers[$newKey])) {
                return false; // New email already exists.
            }
            unset($subscribers[$key]);
            $sub['email'] = $newKey;
            $subscribers[$newKey] = $sub;
        } else {
            $subscribers[$key] = $sub;
        }

        $this->writeFile($subscribers);
        return true;
    }

    /**
     * Find a subscriber by their unsubscribe token.
     *
     * @return array<string, string>|null The subscriber record, or null if not found.
     */
    public function findByToken(string $token): ?array
    {
        if ($token === '') {
            return null;
        }

        foreach ($this->readFile() as $sub) {
            if (hash_equals($sub['unsubscribeToken'] ?? '', $token)) {
                return $sub;
            }
        }

        return null;
    }

    // ── File I/O with flock ──────────────────────────────────────────────────

    /**
     * Read the subscriber file with a shared lock.
     *
     * @return array<string, array<string, string>>
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
        return is_array($data) ? $data : [];
    }

    /**
     * Write the subscriber file atomically with an exclusive lock.
     *
     * @param array<string, array<string, string>> $subscribers
     */
    private function writeFile(array $subscribers): void
    {
        $json = json_encode($subscribers, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
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
