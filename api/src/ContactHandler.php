<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Contact form request handler.
 *
 * POST /contact -> validate, send email to site owner + auto-reply to sender.
 */
final class ContactHandler
{
    /**
     * Handle POST /contact.
     *
     * @param array<string, mixed> $body Parsed JSON body.
     * @return array{status: int, body: array<string, mixed>}
     */
    public static function handle(array $body): array
    {
        // Honeypot — silently accept if filled.
        if (!empty($body['website'] ?? '')) {
            return ['status' => 200, 'body' => ['success' => true]];
        }

        // Validate required fields.
        $name    = trim((string) ($body['name'] ?? ''));
        $email   = strtolower(trim((string) ($body['email'] ?? '')));
        $message = trim((string) ($body['request'] ?? ''));

        if ($name === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Name is required.']];
        }

        $nameMax = (int) ($_ENV['CONTACT_NAME_MAX_LENGTH'] ?? 120);
        if (mb_strlen($name) > $nameMax) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Name is too long.']];
        }

        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'A valid email address is required.']];
        }

        if ($message === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'Message is required.']];
        }

        // Normalize CRLF → LF before counting so the check matches the browser's
        // maxlength attribute (which counts newlines as 1 char). The original $message
        // is preserved for email body use.
        $messageMax = (int) ($_ENV['CONTACT_MESSAGE_MAX_LENGTH'] ?? 4000);
        if (mb_strlen(str_replace("\r\n", "\n", $message)) > $messageMax) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => "Message is too long. Please keep it under {$messageMax} characters."]];
        }

        // Rate limiting.
        $rateLimit = (int) ($_ENV['RATE_LIMIT_CONTACT'] ?? 3);
        if (!RateLimit::check('contact', $email, $rateLimit, 3600)) {
            return ['status' => 429, 'body' => ['success' => false, 'message' => 'Too many messages. Please try again later.']];
        }

        // Send email (templates loaded from api/email-templates.json).
        try {
            $mailer = new Mailer();

            // 1. Send the message to the site owner (notification email).
            $sent = $mailer->sendContactMessage($name, $email, $message);

            // 2. Send auto-reply to the submitter (thank you + copy of their message).
            $mailer->sendContactAutoReply(
                $email,
                $name,
                $message,
            );
        } catch (\Exception) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Email service is not configured.']];
        }

        if (!$sent) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'Failed to send your message. Please try again.']];
        }

        return ['status' => 200, 'body' => ['success' => true]];
    }
}
