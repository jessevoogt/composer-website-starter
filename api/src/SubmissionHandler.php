<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Form submission admin handler.
 *
 * GET  /submissions        → List all submissions with masked emails (Bearer token required).
 * GET  /submissions/detail → Single submission with unmasked email (Bearer token required).
 * POST /submissions/delete → Delete submissions by ID (Bearer token required).
 */
final class SubmissionHandler
{
    // ── List submissions ─────────────────────────────────────────────────────

    /**
     * Handle GET /submissions.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function listSubmissions(): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $manager = new SubmissionManager();
        $submissions = $manager->getAll();

        $list = [];
        foreach ($submissions as $sub) {
            $email = $sub['email'] ?? '';

            // Mask email — use detail endpoint for single unmasked lookups.
            $parts = explode('@', $email, 2);
            $local = $parts[0];
            $domain = $parts[1] ?? '';
            $masked = substr($local, 0, 1) . str_repeat('*', max(3, strlen($local) - 1)) . '@' . $domain;

            $entry = [
                'id'        => $sub['id'] ?? '',
                'type'      => $sub['type'] ?? '',
                'email'     => $masked,
                'name'      => $sub['name'] ?? '',
                'createdAt' => $sub['createdAt'] ?? '',
            ];

            // Include type-specific fields.
            if (($sub['type'] ?? '') === 'contact') {
                $entry['message'] = $sub['message'] ?? '';
            }
            if (($sub['type'] ?? '') === 'perusal') {
                $entry['workId'] = $sub['workId'] ?? '';
            }
            if (isset($sub['newsletterOptIn'])) {
                $entry['newsletterOptIn'] = $sub['newsletterOptIn'];
            }

            $list[] = $entry;
        }

        return ['status' => 200, 'body' => [
            'success'     => true,
            'count'       => count($list),
            'submissions' => $list,
        ]];
    }

    // ── Submission detail (single) ───────────────────────────────────────────

    /**
     * Handle GET /submissions/detail?id=xxx.
     *
     * Returns full (unmasked) submission data.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function submissionDetail(): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'ID is required.']];
        }

        $manager = new SubmissionManager();
        $sub = $manager->getById($id);

        if ($sub === null) {
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'Submission not found.']];
        }

        return ['status' => 200, 'body' => array_merge(['success' => true], $sub)];
    }

    // ── Delete submissions ───────────────────────────────────────────────────

    /**
     * Handle POST /submissions/delete.
     *
     * Required body: { "ids": ["uuid-1", "uuid-2", ...] }
     *
     * @param array<string, mixed> $body
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function deleteSubmissions(array $body): array
    {
        if (!self::validateAuth()) {
            return ['status' => 401, 'body' => ['success' => false, 'message' => 'Unauthorized.']];
        }

        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || $ids === []) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'No submission IDs provided.']];
        }

        $manager = new SubmissionManager();
        $removed = $manager->removeByIds($ids);

        return ['status' => 200, 'body' => ['success' => true, 'removed' => $removed]];
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
}
