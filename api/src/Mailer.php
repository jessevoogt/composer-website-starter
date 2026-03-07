<?php

declare(strict_types=1);

namespace CmsAcc;

use SendGrid;
use SendGrid\Mail\Mail;

/**
 * Email delivery via SendGrid API.
 *
 * Thin wrapper around the SendGrid PHP SDK.
 * Sends multipart emails (HTML + plain-text fallback).
 *
 * Email body templates are loaded from `api/email-templates.json`, generated
 * from Keystatic YAML by `scripts/generate-api-config.mjs`. Templates support
 * simple `{{tokenName}}` placeholders replaced at send time, and conditional
 * blocks `{{#if tokenName}}...{{/if}}` that are included only when the token
 * resolves to a non-empty string. Literal `{{#if true}}` / `{{#if false}}`
 * are also supported for unconditionally enabling or disabling a block.
 */
final class Mailer
{
    private SendGrid $client;
    private string $fromEmail;
    private string $fromName;
    private string $lastSentSubject = '';
    private string $lastSentBody = '';
    private string $lastSentBodyHtml = '';
    private string $lastSentFallbackUrl = '';
    /** @var array<string, string> Cached email templates */
    private static array $templates = [];
    /** Base64-encoded favicon PNG for CID inline attachment (null if unavailable). */
    private ?string $logoBase64 = null;
    /** Base64-encoded brand logo PNG for email signature (null if unavailable). */
    private ?string $brandLogoBase64 = null;
    /** Whether to show the favicon in the email header bar. */
    private bool $showHeaderFavicon = true;
    /** Whether to show the brand logo in the email signature. */
    private bool $showSignatureLogo = true;
    /** Display width (px) for the brand logo in the email signature. */
    private int $signatureLogoWidth = 160;

    public function __construct()
    {
        $apiKey = $_ENV['SENDGRID_API_KEY'] ?? '';
        if ($apiKey === '') {
            throw new \RuntimeException('SENDGRID_API_KEY is not configured.');
        }

        $this->client    = new SendGrid($apiKey);
        $this->fromEmail = $_ENV['FROM_EMAIL'] ?? '';
        $this->fromName  = $_ENV['COMPOSER_NAME'] ?? '';

        // Email layout settings.
        $this->showHeaderFavicon  = ($_ENV['EMAIL_SHOW_HEADER_FAVICON'] ?? 'true') === 'true';
        $this->showSignatureLogo  = ($_ENV['EMAIL_SHOW_SIGNATURE_LOGO'] ?? 'true') === 'true';
        $this->signatureLogoWidth = (int) ($_ENV['EMAIL_SIGNATURE_LOGO_WIDTH'] ?? '160');

        // Favicon for header.
        $logoPath = dirname(__DIR__) . '/email-logo.png';
        if (is_file($logoPath)) {
            $content = file_get_contents($logoPath);
            if ($content !== false) {
                $this->logoBase64 = base64_encode($content);
            }
        }

        // Brand logo for signature.
        $brandLogoPath = dirname(__DIR__) . '/email-brand-logo.png';
        if (is_file($brandLogoPath)) {
            $content = file_get_contents($brandLogoPath);
            if ($content !== false) {
                $this->brandLogoBase64 = base64_encode($content);
            }
        }
    }

    /**
     * Send an email.
     *
     * @param string      $to           Recipient email address.
     * @param string      $subject      Email subject.
     * @param string      $html         HTML body.
     * @param string      $text         Plain-text fallback body.
     * @param string|null $replyTo      Optional reply-to address.
     * @param string|null $replyToName  Optional reply-to name.
     * @return bool Whether the send was accepted (2xx status).
     */
    public function send(
        string $to,
        string $subject,
        string $html,
        string $text,
        ?string $replyTo = null,
        ?string $replyToName = null,
    ): bool {
        $this->lastSentSubject = $subject;
        $this->lastSentBody = $text;

        $email = new Mail();
        $email->setFrom($this->fromEmail, $this->fromName);
        $email->setSubject($subject);
        $email->addTo($to);
        $email->addContent('text/plain', $text);
        $email->addContent('text/html', $html);

        if ($this->showHeaderFavicon && $this->logoBase64 !== null) {
            $email->addAttachment($this->logoBase64, 'image/png', 'logo.png', 'inline', 'header-logo');
        }
        if ($this->showSignatureLogo && $this->brandLogoBase64 !== null) {
            $email->addAttachment($this->brandLogoBase64, 'image/png', 'brand-logo.png', 'inline', 'brand-logo');
        }

        if ($replyTo !== null && $replyTo !== '') {
            $email->setReplyTo($replyTo, $replyToName ?? '');
        }

        try {
            $response = $this->client->send($email);
            $status   = $response->statusCode();
            return $status >= 200 && $status < 300;
        } catch (\Exception) {
            return false;
        }
    }

    // ── Template loading ──────────────────────────────────────────────────────

    /**
     * Load email templates from the generated JSON file.
     *
     * @return array<string, string>
     */
    private static function loadTemplates(): array
    {
        if (self::$templates !== []) {
            return self::$templates;
        }

        $path = dirname(__DIR__) . '/email-templates.json';
        if (is_file($path)) {
            $json = file_get_contents($path);
            if ($json !== false) {
                $parsed = json_decode($json, true);
                if (is_array($parsed)) {
                    self::$templates = $parsed;
                }
            }
        }

        return self::$templates;
    }

    /**
     * Get a specific template string, with a fallback default.
     */
    private static function getTemplate(string $key, string $default = ''): string
    {
        $templates = self::loadTemplates();
        $value = $templates[$key] ?? '';
        return $value !== '' ? $value : $default;
    }

    // ── Conditional blocks ────────────────────────────────────────────────────

    /**
     * Process `{{#if tokenName}}...{{/if}}` conditional blocks.
     *
     * If the named token resolves to a non-empty string, the inner content is
     * kept (with the `{{#if}}` / `{{/if}}` tags stripped). If the token is empty
     * or missing, the entire block — tags and content — is removed.
     *
     * Literal booleans are also supported: `{{#if true}}` always includes the
     * block and `{{#if false}}` always strips it, regardless of the token map.
     * This is useful for quickly disabling a template block without removing it.
     *
     * After removal, triple-or-more consecutive newlines are collapsed to double
     * newlines to prevent extra blank paragraphs in the rendered output.
     *
     * @param string               $template Template text with conditional blocks.
     * @param array<string, string> $tokens   Map of token name → value.
     * @return string Template with conditional blocks resolved.
     */
    private function processConditionals(string $template, array $tokens): string
    {
        $result = preg_replace_callback(
            '/\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/s',
            function (array $matches) use ($tokens): string {
                $tokenName = $matches[1];
                $content = $matches[2];

                // Literal booleans: {{#if true}} always includes, {{#if false}} always strips.
                if ($tokenName === 'false') {
                    return '';
                }
                if ($tokenName === 'true') {
                    return $content;
                }

                $value = $tokens[$tokenName] ?? '';
                return $value !== '' ? $content : '';
            },
            $template
        );

        if ($result === null) {
            return $template;
        }

        // Collapse triple+ newlines to double (prevents empty paragraphs after block removal).
        return (string) preg_replace('/\n{3,}/', "\n\n", $result);
    }

    // ── Token replacement ─────────────────────────────────────────────────────

    /**
     * Replace {{token}} placeholders with values in a plain-text template.
     *
     * Processes conditional blocks first, then replaces remaining tokens.
     * URL tokens (scoreLink, workPageLink, siteUrl) are inserted as bare URLs.
     *
     * @param string               $template Template text with {{token}} placeholders.
     * @param array<string, string> $tokens   Map of token name → value.
     * @return string
     */
    private function replaceTokensText(string $template, array $tokens): string
    {
        $result = $this->processConditionals($template, $tokens);
        foreach ($tokens as $name => $value) {
            $result = str_replace('{{' . $name . '}}', $value, $result);
        }
        return $result;
    }

    /**
     * CTA button tokens: token name → button label.
     * When a token's URL is empty, the button is omitted.
     *
     * @var array<string, string>
     */
    private const CTA_TOKENS = [
        'scoreLink'          => 'View Perusal Score',
        'watermarkedPdfLink' => 'Download Score (PDF)',
        'originalPdfLink'    => 'Download Original Score (PDF)',
    ];

    /**
     * Convert a plain-text template to HTML with token replacement.
     *
     * - All token values are HTML-escaped before insertion.
     * - CTA tokens (scoreLink, watermarkedPdfLink, originalPdfLink) render as buttons.
     * - {{workPageLink}} and {{siteUrl}} are rendered as clickable links.
     * - Double newlines become paragraph breaks; single newlines become <br>.
     *
     * @param string               $template Template text with {{token}} placeholders.
     * @param array<string, string> $tokens   Map of token name → value.
     * @return string HTML body content (paragraphs only, no outer wrapper).
     */
    private function templateToHtml(string $template, array $tokens): string
    {
        // Process conditional blocks first (before any token replacement).
        $template = $this->processConditionals($template, $tokens);

        // Escape all values for HTML insertion.
        $escaped = [];
        foreach ($tokens as $name => $value) {
            $escaped[$name] = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
        }

        // Replace URL tokens with clickable links.
        $urlTokens = ['workPageLink', 'siteUrl', 'unsubscribeLink'];
        foreach ($urlTokens as $name) {
            if (isset($escaped[$name]) && $escaped[$name] !== '') {
                $escaped[$name] = '<a href="' . $escaped[$name] . '" style="color:#4b5563;text-decoration:underline;">'
                    . $escaped[$name] . '</a>';
            }
        }

        // Build CTA marker map: each CTA token gets a unique marker.
        $ctaMarkers = []; // marker → { url, urlEsc, label }
        foreach (self::CTA_TOKENS as $tokenName => $buttonLabel) {
            $url = $tokens[$tokenName] ?? '';
            $marker = '%%CTA_' . strtoupper($tokenName) . '%%';
            $ctaMarkers[$marker] = [
                'url'    => $url,
                'urlEsc' => htmlspecialchars($url, ENT_QUOTES, 'UTF-8'),
                'label'  => $buttonLabel,
            ];
            // Remove from escaped map so it's not double-handled.
            unset($escaped[$tokenName]);
        }

        $result = $template;

        // Replace CTA tokens with their unique markers.
        foreach (self::CTA_TOKENS as $tokenName => $buttonLabel) {
            $marker = '%%CTA_' . strtoupper($tokenName) . '%%';
            $result = str_replace('{{' . $tokenName . '}}', $marker, $result);
        }

        // Replace remaining tokens with their escaped HTML values.
        foreach ($escaped as $name => $value) {
            $result = str_replace('{{' . $name . '}}', $value, $result);
        }

        // Convert to paragraphs: split on double newlines.
        $paragraphs = preg_split('/\n{2,}/', trim($result));
        if ($paragraphs === false) {
            $paragraphs = [trim($result)];
        }

        $htmlParts = [];
        foreach ($paragraphs as $paragraph) {
            $paragraph = trim($paragraph);
            if ($paragraph === '') {
                continue;
            }

            // Check if this paragraph contains any CTA marker.
            $foundMarker = null;
            foreach ($ctaMarkers as $marker => $info) {
                if (str_contains($paragraph, $marker)) {
                    $foundMarker = $marker;
                    break;
                }
            }

            if ($foundMarker !== null) {
                $info = $ctaMarkers[$foundMarker];
                // Split around the marker — render text before/after as paragraphs, and the CTA as a button.
                $parts  = explode($foundMarker, $paragraph, 2);
                $before = trim(str_replace("\n", '<br>', $parts[0]));
                $after  = trim(str_replace("\n", '<br>', $parts[1] ?? ''));

                if ($before !== '') {
                    $htmlParts[] = '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">'
                        . $before . '</p>';
                }

                // CTA button (only if URL is not empty).
                if ($info['url'] !== '') {
                    $htmlParts[] = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">'
                        . '<tr><td style="border-radius:4px;background-color:#18212b;">'
                        . '<a href="' . $info['urlEsc'] . '" target="_blank" style="display:inline-block;padding:14px 32px;color:#ecf2f7;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">'
                        . htmlspecialchars($info['label'], ENT_QUOTES, 'UTF-8') . '</a></td></tr></table>';
                }

                // Process remaining text after the marker (may contain more CTA markers).
                if ($after !== '') {
                    // Check if the remaining text has more CTA markers.
                    $hasMoreMarkers = false;
                    foreach ($ctaMarkers as $otherMarker => $otherInfo) {
                        if (str_contains($after, $otherMarker)) {
                            $hasMoreMarkers = true;
                            break;
                        }
                    }

                    if ($hasMoreMarkers) {
                        // Re-process the remaining text to handle nested CTA markers.
                        // Wrap it as a "paragraph" and recursively process via the same loop.
                        // Simple approach: just add it back as text for the next paragraph.
                        $htmlParts[] = '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">'
                            . $after . '</p>';
                    } else {
                        $htmlParts[] = '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">'
                            . $after . '</p>';
                    }
                }
            } else {
                // Regular paragraph — convert single newlines to <br>.
                // Also strip any leftover CTA markers with empty URLs.
                $inner = str_replace("\n", '<br>', $paragraph);
                foreach ($ctaMarkers as $marker => $info) {
                    $inner = str_replace($marker, '', $inner);
                }
                $inner = trim($inner);
                if ($inner !== '') {
                    $htmlParts[] = '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">'
                        . $inner . '</p>';
                }
            }
        }

        return implode("\n", $htmlParts);
    }

    // ── Email header logo ─────────────────────────────────────────────────────

    /**
     * Build the inner HTML for the dark email header bar (logo + title).
     *
     * If the email logo is available, renders a table with the logo image
     * to the left of the title text. Otherwise renders just the title text.
     * The title should already be HTML-escaped.
     */
    private function buildHeaderContent(string $escapedTitle): string
    {
        if ($this->showHeaderFavicon && $this->logoBase64 !== null) {
            return '<table role="presentation" cellpadding="0" cellspacing="0" border="0">'
                . '<tr>'
                . '<td style="vertical-align:middle;padding-right:12px;">'
                . '<img src="cid:header-logo" width="28" height="28" alt="" style="display:block;">'
                . '</td>'
                . '<td style="vertical-align:middle;">'
                . '<p style="margin:0;color:#ecf2f7;font-size:16px;font-weight:600;letter-spacing:0.02em;">'
                . $escapedTitle
                . '</p>'
                . '</td>'
                . '</tr>'
                . '</table>';
        }

        return '<p style="margin:0;color:#ecf2f7;font-size:16px;font-weight:600;letter-spacing:0.02em;">'
            . $escapedTitle
            . '</p>';
    }

    // ── Email footer / signature ────────────────────────────────────────────

    /**
     * Build the brand logo `<img>` HTML for the email signature, or empty string
     * if the logo is disabled or unavailable.
     */
    private function buildSignatureLogoHtml(): string
    {
        if (!$this->showSignatureLogo || $this->brandLogoBase64 === null) {
            return '';
        }
        $w = $this->signatureLogoWidth;
        return '<p style="margin:0 0 12px;text-align:center;">'
            . '<img src="cid:brand-logo" width="' . $w . '" alt="" style="display:inline-block;">'
            . '</p>';
    }

    /**
     * Build the inner HTML for the email footer (brand logo + copyright).
     *
     * If the brand logo is available and enabled, renders it centered above the
     * copyright text. Otherwise renders just the copyright text (current default).
     */
    private function buildFooterContent(string $escapedComposer): string
    {
        return $this->buildSignatureLogoHtml()
            . '<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">'
            . '&copy; ' . $escapedComposer
            . '</p>';
    }

    // ── Email wrapper (shared HTML chrome) ────────────────────────────────────

    /**
     * Wrap body HTML in the standard email layout (header, footer, fallback link).
     *
     * @param string $bodyHtml    Inner HTML content (paragraphs).
     * @param string $headerTitle Text for the dark header bar.
     * @param string $fallbackUrl Optional URL to show as a fallback "can't click the button?" link.
     */
    private function wrapEmail(string $bodyHtml, string $headerTitle, string $fallbackUrl = ''): string
    {
        $ht = htmlspecialchars($headerTitle, ENT_QUOTES, 'UTF-8');
        $composer = htmlspecialchars($this->fromName, ENT_QUOTES, 'UTF-8');

        $fallbackRow = '';
        if ($fallbackUrl !== '') {
            $fu = htmlspecialchars($fallbackUrl, ENT_QUOTES, 'UTF-8');
            $fallbackRow = <<<HTML
                  <tr>
                    <td style="padding:0 32px 20px;">
                      <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;text-align:center;">
                        Can't click the button? Copy this link:<br>
                        <a href="{$fu}" style="color:#6b7280;word-break:break-all;">{$fu}</a>
                      </p>
                    </td>
                  </tr>
            HTML;
        }

        $headerContent = $this->buildHeaderContent($ht);
        $footerContent = $this->buildFooterContent($composer);

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:4px;overflow:hidden;">
                  <tr>
                    <td style="background-color:#18212b;padding:24px 32px;">
                      {$headerContent}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px;">
                      {$bodyHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px;">
                      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 32px;">
                      {$footerContent}
                    </td>
                  </tr>
                  {$fallbackRow}
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        HTML;
    }

    // ── Magic-link email ─────────────────────────────────────────────────────

    /**
     * Send a perusal score magic-link email.
     *
     * Template and subject are loaded from email-templates.json.
     * Tokens are replaced at send time.
     *
     * @param array<string, string> $pdfLinks Map of PDF type → download URL (e.g. 'watermarked' → URL).
     */
    public function sendMagicLink(
        string $toEmail,
        string $firstName,
        string $magicLink,
        string $workTitle,
        string $workId,
        int $expDays,
        array $pdfLinks = [],
    ): bool {
        $frontendUrl = rtrim($_ENV['FRONTEND_URL'] ?? '', '/');
        $workPageLink = $workId !== ''
            ? $frontendUrl . '/music/' . rawurlencode($workId) . '/'
            : $frontendUrl;

        $tokens = [
            'firstName'          => $firstName,
            'workTitle'          => $workTitle,
            'composerName'       => $this->fromName,
            'scoreLink'          => $magicLink,
            'watermarkedPdfLink' => $pdfLinks['watermarked'] ?? '',
            'originalPdfLink'    => $pdfLinks['original'] ?? '',
            'workPageLink'       => $workPageLink,
            'siteUrl'            => $frontendUrl,
            'expirationDays'     => (string) $expDays,
        ];

        // Subject.
        $defaultSubject = "Your perusal score, {$firstName}"
            . ($workTitle !== '' ? " — {$workTitle}" : '');
        $subjectTemplate = self::getTemplate('perusalSubject', $defaultSubject);
        $subject = $this->sanitizeSubject($this->replaceTokensText($subjectTemplate, $tokens));

        // Body — use template if available, otherwise fall back to a simple default.
        $bodyTemplate = self::getTemplate('perusalBody');
        if ($bodyTemplate !== '') {
            $text     = $this->replaceTokensText($bodyTemplate, $tokens);
            $bodyHtml = $this->templateToHtml($bodyTemplate, $tokens);
        } else {
            $text     = $this->magicLinkTextFallback($firstName, $magicLink, $workTitle, $expDays);
            $bodyHtml = $this->magicLinkBodyHtmlFallback($firstName, $magicLink, $workTitle, $expDays);
        }

        // Store for use by sendPerusalNotification (called on the same instance right after).
        $this->lastSentBodyHtml    = $bodyHtml;
        $this->lastSentFallbackUrl = $magicLink;

        $html = $this->wrapEmail($bodyHtml, $this->fromName, $magicLink);

        return $this->send($toEmail, $subject, $html, $text);
    }

    /**
     * Send a notification to the site owner about a perusal score request.
     *
     * Must be called on the same Mailer instance immediately after sendMagicLink(),
     * as it reads the stored subject, body text, body HTML, and fallback URL from
     * that preceding send.
     */
    public function sendPerusalNotification(
        string $requesterEmail,
        string $requesterName,
        string $workTitle,
        string $workSubtitle = '',
        string $workId = '',
        bool $newsletterOptIn = false,
    ): bool {
        $recipient = $_ENV['CONTACT_RECIPIENT'] ?? $this->fromEmail;
        $domain    = $this->siteDomain();

        $frontendUrl = rtrim($_ENV['FRONTEND_URL'] ?? '', '/');
        $workPageUrl = $workId !== ''
            ? $frontendUrl . '/music/' . rawurlencode($workId) . '/'
            : '';

        $tokens = [
            'firstName'  => $requesterName,
            'workTitle'  => $workTitle,
            'composerName' => $this->fromName,
            'siteDomain' => $domain,
        ];

        $defaultSubject = "New score request from {$requesterName} via {$domain}";
        $subjectTemplate = self::getTemplate('perusalNotificationSubject', $defaultSubject);
        $subject = $this->sanitizeSubject($this->replaceTokensText($subjectTemplate, $tokens));

        $html = $this->perusalNotificationHtml(
            $requesterName, $requesterEmail, $workTitle, $workSubtitle, $workPageUrl,
            $this->lastSentSubject, $this->lastSentBodyHtml, $this->lastSentFallbackUrl,
            $newsletterOptIn,
        );
        $text = $this->perusalNotificationText(
            $requesterName, $requesterEmail, $workTitle, $workSubtitle, $workPageUrl,
            $this->lastSentSubject, $this->lastSentBody,
            $newsletterOptIn,
        );

        return $this->send($recipient, $subject, $html, $text, $requesterEmail, $requesterName);
    }

    private function perusalNotificationText(
        string $requesterName,
        string $requesterEmail,
        string $workTitle,
        string $workSubtitle,
        string $workPageUrl,
        string $sentSubject,
        string $sentBody,
        bool $newsletterOptIn = false,
    ): string {
        $workLine = $workTitle;
        if ($workSubtitle !== '') {
            $workLine .= " — {$workSubtitle}";
        }
        if ($workPageUrl !== '') {
            $workLine .= "\n       {$workPageUrl}";
        }

        return implode("\n", [
            'New perusal score request',
            '=========================',
            '',
            "From: {$requesterName}",
            "Email: {$requesterEmail}",
            'Newsletter: ' . ($newsletterOptIn ? 'Yes' : 'No'),
            "Work: {$workLine}",
            '',
            '--- Email sent to requester ---',
            "Subject: {$sentSubject}",
            '',
            $sentBody,
            '--- End of email ---',
        ]);
    }

    private function perusalNotificationHtml(
        string $requesterName,
        string $requesterEmail,
        string $workTitle,
        string $workSubtitle,
        string $workPageUrl,
        string $sentSubject,
        string $sentBodyHtml,
        string $sentFallbackUrl,
        bool $newsletterOptIn = false,
    ): string {
        $name    = htmlspecialchars($requesterName, ENT_QUOTES, 'UTF-8');
        $email   = htmlspecialchars($requesterEmail, ENT_QUOTES, 'UTF-8');
        $work    = htmlspecialchars($workTitle, ENT_QUOTES, 'UTF-8');
        $sent    = htmlspecialchars($sentSubject, ENT_QUOTES, 'UTF-8');
        $composer = htmlspecialchars($this->fromName, ENT_QUOTES, 'UTF-8');
        $newsletterBadge = $newsletterOptIn
            ? '<span style="display:inline-block;margin-top:6px;padding:2px 8px;background-color:#d1fae5;color:#065f46;font-size:11px;font-weight:600;letter-spacing:0.03em;border-radius:3px;">NEWSLETTER: YES</span>'
            : '<span style="display:inline-block;margin-top:6px;padding:2px 8px;background-color:#f3f4f6;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.03em;border-radius:3px;">NEWSLETTER: NO</span>';

        // Work title — link to work detail page if URL is available.
        $workTitleHtml = $work;
        if ($workPageUrl !== '') {
            $wu = htmlspecialchars($workPageUrl, ENT_QUOTES, 'UTF-8');
            $workTitleHtml = '<a href="' . $wu . '" style="color:#1a1a2e;text-decoration:underline;">' . $work . '</a>';
        }

        // Optional subtitle line.
        $subtitleHtml = '';
        if ($workSubtitle !== '') {
            $sub = htmlspecialchars($workSubtitle, ENT_QUOTES, 'UTF-8');
            $subtitleHtml = '<p style="margin:4px 0 0;color:#4b5563;font-size:14px;">' . $sub . '</p>';
        }

        $fallbackSection = '';
        if ($sentFallbackUrl !== '') {
            $fu = htmlspecialchars($sentFallbackUrl, ENT_QUOTES, 'UTF-8');
            $fallbackSection = '<p style="margin:16px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;text-align:center;">'
                . 'Can&#39;t click the button? Copy this link:<br>'
                . '<a href="' . $fu . '" style="color:#6b7280;word-break:break-all;">' . $fu . '</a></p>';
        }

        $innerHtml = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">'
            . '<tr><td style="padding:12px 16px;background-color:#f9fafb;border-left:3px solid #18212b;">'
            . '<p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">From</p>'
            . '<p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:600;">' . $name . '</p>'
            . '<p style="margin:4px 0 0;color:#4b5563;font-size:14px;">'
            . '<a href="mailto:' . $email . '" style="color:#4b5563;text-decoration:underline;">' . $email . '</a></p>'
            . $newsletterBadge
            . '</td></tr></table>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">'
            . '<tr><td style="padding:12px 16px;background-color:#f9fafb;border-left:3px solid #18212b;">'
            . '<p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Work</p>'
            . '<p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:600;">' . $workTitleHtml . '</p>'
            . $subtitleHtml
            . '</td></tr></table>'
            . '<p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email sent to requester</p>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">'
            . '<tr><td style="padding:16px;background-color:#f9fafb;border-left:3px solid #d1d5db;border-radius:0 4px 4px 0;">'
            . '<p style="margin:0 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Subject</p>'
            . '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;font-weight:600;">' . $sent . '</p>'
            . '<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">'
            . $sentBodyHtml
            . $fallbackSection
            . '</td></tr></table>';

        $footerHtml = $this->buildSignatureLogoHtml()
            . '<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">'
            . "This request was submitted via the perusal score access form on your website. Reply directly to respond to {$name}.</p>";

        $headerContent = $this->buildHeaderContent("{$composer} — Score Request");

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:4px;overflow:hidden;">
                  <tr>
                    <td style="background-color:#18212b;padding:24px 32px;">
                      {$headerContent}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px;">
                      {$innerHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                      {$footerHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        HTML;
    }

    /** Hardcoded plain-text fallback (used when email-templates.json is absent). */
    private function magicLinkTextFallback(
        string $firstName,
        string $magicLink,
        string $workTitle,
        int $expDays,
    ): string {
        $composer = $this->fromName;
        $workLine = $workTitle !== '' ? " for \"{$workTitle}\"" : '';

        return implode("\n", [
            "Hi {$firstName},",
            '',
            "You requested access to view the perusal score{$workLine}.",
            '',
            'Open this link to view the score:',
            $magicLink,
            '',
            "This link will expire in {$expDays} days.",
            '',
            "If you didn't request this, you can safely ignore this email.",
            '',
            "— {$composer}",
        ]);
    }

    /** Hardcoded inner-HTML-body fallback (used when email-templates.json is absent). */
    private function magicLinkBodyHtmlFallback(
        string $firstName,
        string $magicLink,
        string $workTitle,
        int $expDays,
    ): string {
        $fn       = htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8');
        $link     = htmlspecialchars($magicLink, ENT_QUOTES, 'UTF-8');
        $wt       = htmlspecialchars($workTitle, ENT_QUOTES, 'UTF-8');
        $ed       = htmlspecialchars((string) $expDays, ENT_QUOTES, 'UTF-8');

        $workLine = $workTitle !== '' ? " for <strong>{$wt}</strong>" : '';
        $bodyHtml = "You requested access to view the perusal score{$workLine}. Click the button below to view it.";

        return '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">Hi ' . $fn . ',</p>'
            . '<p style="margin:0 0 24px;color:#1a1a2e;font-size:15px;line-height:1.6;">' . $bodyHtml . '</p>'
            . '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">'
            . '<tr><td style="border-radius:4px;background-color:#18212b;">'
            . '<a href="' . $link . '" target="_blank" style="display:inline-block;padding:14px 32px;color:#ecf2f7;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">'
            . 'View Perusal Score</a></td></tr></table>'
            . '<p style="margin:0 0 16px;color:#6b7280;font-size:13px;line-height:1.5;">'
            . "This link will expire in {$ed} days. If you need access again after that, simply request a new link from the website.</p>"
            . '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">'
            . "If you didn't request this, you can safely ignore this email.</p>";
    }

    // ── Contact form email ───────────────────────────────────────────────────

    /**
     * Send a contact form message to the site owner.
     */
    public function sendContactMessage(string $senderName, string $senderEmail, string $message, bool $newsletterOptIn = false): bool
    {
        $recipient = $_ENV['CONTACT_RECIPIENT'] ?? $this->fromEmail;
        $domain    = $this->siteDomain();
        $subject   = $this->sanitizeSubject("New message from {$senderName} via {$domain}");

        $html = $this->contactHtml($senderName, $senderEmail, $message, $newsletterOptIn);
        $text = $this->contactText($senderName, $senderEmail, $message, $newsletterOptIn);

        return $this->send($recipient, $subject, $html, $text, $senderEmail, $senderName);
    }

    /**
     * Send an auto-reply to the contact form submitter.
     *
     * Template and subject are loaded from email-templates.json.
     */
    public function sendContactAutoReply(
        string $toEmail,
        string $toName,
        string $originalMessage,
    ): bool {
        $frontendUrl = rtrim($_ENV['FRONTEND_URL'] ?? '', '/');

        $tokens = [
            'name'         => $toName,
            'composerName' => $this->fromName,
            'siteUrl'      => $frontendUrl,
        ];

        // Subject.
        $defaultSubject = "Thank you for your message — {$this->fromName}";
        $subjectTemplate = self::getTemplate('contactAutoReplySubject', $defaultSubject);
        $subject = $this->sanitizeSubject($this->replaceTokensText($subjectTemplate, $tokens));

        // Body — use template if available, otherwise fall back.
        $bodyTemplate = self::getTemplate('contactAutoReplyBody');
        $bodyText = $bodyTemplate !== ''
            ? $this->replaceTokensText($bodyTemplate, $tokens)
            : "Thank you for reaching out. I have received your message and will get back to you soon.";

        $html = $this->autoReplyHtml($toName, $originalMessage, $bodyText, $tokens);
        $text = $this->autoReplyText($toName, $originalMessage, $bodyText);

        return $this->send($toEmail, $subject, $html, $text);
    }

    private function contactText(string $senderName, string $senderEmail, string $message, bool $newsletterOptIn = false): string
    {
        $lines = [
            'New contact form message',
            '========================',
            '',
            "From: {$senderName}",
            "Email: {$senderEmail}",
            'Newsletter: ' . ($newsletterOptIn ? 'Yes' : 'No'),
            '',
            'Message:',
            $message,
        ];
        return implode("\n", $lines);
    }

    private function contactHtml(string $senderName, string $senderEmail, string $message, bool $newsletterOptIn = false): string
    {
        $name     = htmlspecialchars($senderName, ENT_QUOTES, 'UTF-8');
        $email    = htmlspecialchars($senderEmail, ENT_QUOTES, 'UTF-8');
        $msg      = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
        $composer = htmlspecialchars($this->fromName, ENT_QUOTES, 'UTF-8');
        $newsletterBadge = $newsletterOptIn
            ? '<span style="display:inline-block;margin-top:6px;padding:2px 8px;background-color:#d1fae5;color:#065f46;font-size:11px;font-weight:600;letter-spacing:0.03em;border-radius:3px;">NEWSLETTER: YES</span>'
            : '<span style="display:inline-block;margin-top:6px;padding:2px 8px;background-color:#f3f4f6;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.03em;border-radius:3px;">NEWSLETTER: NO</span>';

        $innerHtml = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">'
            . '<tr><td style="padding:12px 16px;background-color:#f9fafb;border-left:3px solid #18212b;">'
            . '<p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">From</p>'
            . '<p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:600;">' . $name . '</p>'
            . '<p style="margin:4px 0 0;color:#4b5563;font-size:14px;">'
            . '<a href="mailto:' . $email . '" style="color:#4b5563;text-decoration:underline;">' . $email . '</a></p>'
            . $newsletterBadge
            . '</td></tr></table>'
            . '<p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Message</p>'
            . '<div style="color:#1a1a2e;font-size:15px;line-height:1.6;white-space:pre-wrap;">' . $msg . '</div>';

        $footerHtml = $this->buildSignatureLogoHtml()
            . '<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">'
            . "This message was sent via the contact form on your website. Reply directly to respond to {$name}.</p>";

        $headerContent = $this->buildHeaderContent("{$composer} — Contact Form");

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:4px;overflow:hidden;">
                  <tr>
                    <td style="background-color:#18212b;padding:24px 32px;">
                      {$headerContent}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px;">
                      {$innerHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                      {$footerHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        HTML;
    }

    // ── Auto-reply templates ─────────────────────────────────────────────────

    private function autoReplyText(string $name, string $originalMessage, string $thankYouText): string
    {
        $composer = $this->fromName;

        return implode("\n", [
            $thankYouText,
            '',
            '---',
            'Your message:',
            $originalMessage,
            '---',
            '',
            "— {$composer}",
        ]);
    }

    /**
     * @param array<string, string> $tokens Token map for templateToHtml.
     */
    private function autoReplyHtml(string $name, string $originalMessage, string $bodyText, array $tokens): string
    {
        $msg = nl2br(htmlspecialchars($originalMessage, ENT_QUOTES, 'UTF-8'));

        // If we have a template with tokens, render it properly. Otherwise, fall back to simple nl2br.
        $bodyTemplate = self::getTemplate('contactAutoReplyBody');
        if ($bodyTemplate !== '') {
            $bodyHtml = $this->templateToHtml($bodyTemplate, $tokens);
        } else {
            $n    = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
            $body = nl2br(htmlspecialchars($bodyText, ENT_QUOTES, 'UTF-8'));
            $bodyHtml = '<p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">Hi ' . $n . ',</p>'
                . '<p style="margin:0 0 24px;color:#1a1a2e;font-size:15px;line-height:1.6;">' . $body . '</p>';
        }

        $originalMessageHtml = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">'
            . '<tr><td style="padding:16px;background-color:#f9fafb;border-left:3px solid #d1d5db;border-radius:0 4px 4px 0;">'
            . '<p style="margin:0 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Your message</p>'
            . '<div style="color:#4b5563;font-size:14px;line-height:1.6;white-space:pre-wrap;">' . $msg . '</div>'
            . '</td></tr></table>';

        return $this->wrapEmail($bodyHtml . $originalMessageHtml, $this->fromName);
    }

    // ── Newsletter email ──────────────────────────────────────────────────────

    /**
     * Send a newsletter email to a single subscriber.
     *
     * Reuses the existing templateToHtml() and wrapEmail() for consistent styling.
     * Adds an unsubscribe link block and List-Unsubscribe headers.
     *
     * @param string $toEmail          Subscriber email address.
     * @param string $firstName        Subscriber first name.
     * @param string $subject          Newsletter subject line.
     * @param string $bodyText         Newsletter body (plain text with {{token}} placeholders).
     * @param string $unsubscribeToken Subscriber's unsubscribe token.
     * @return bool Whether the send was accepted (2xx status).
     */
    public function sendNewsletter(
        string $toEmail,
        string $firstName,
        string $subject,
        string $bodyText,
        string $unsubscribeToken,
    ): bool {
        $frontendUrl = rtrim($_ENV['FRONTEND_URL'] ?? '', '/');
        $apiEndpoint = rtrim($_ENV['API_ENDPOINT'] ?? '', '/');
        if ($apiEndpoint === '') {
            $apiEndpoint = $frontendUrl . '/api';
        }

        $unsubscribeUrl = $apiEndpoint . '/unsubscribe?token=' . rawurlencode($unsubscribeToken);

        $tokens = [
            'firstName'       => $firstName,
            'composerName'    => $this->fromName,
            'siteUrl'         => $frontendUrl,
            'unsubscribeLink' => $unsubscribeUrl,
        ];

        // Subject (with token replacement).
        $resolvedSubject = $this->sanitizeSubject($this->replaceTokensText($subject, $tokens));

        // Body — render using the same template system.
        $text     = $this->replaceTokensText($bodyText, $tokens);
        $bodyHtml = $this->templateToHtml($bodyText, $tokens);

        // Add unsubscribe block above the footer.
        $domain = $this->siteDomain();
        $unsubEsc = htmlspecialchars($unsubscribeUrl, ENT_QUOTES, 'UTF-8');
        $domainEsc = htmlspecialchars($domain, ENT_QUOTES, 'UTF-8');
        $unsubscribeBlock = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            . '<tr><td style="padding:16px 0 0;">'
            . '<p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;text-align:center;">'
            . 'You are receiving this because you subscribed on ' . $domainEsc . '.<br>'
            . '<a href="' . $unsubEsc . '" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>'
            . '</p>'
            . '</td></tr></table>';

        $html = $this->wrapEmail($bodyHtml . $unsubscribeBlock, $this->fromName);

        // Add unsubscribe link to plain text.
        $text .= "\n\n---\nYou are receiving this because you subscribed on {$domain}.\nUnsubscribe: {$unsubscribeUrl}";

        try {
            // Build email with List-Unsubscribe headers (RFC 8058).
            $email = new Mail();
            $email->setFrom($this->fromEmail, $this->fromName);
            $email->setSubject($resolvedSubject);
            $email->addTo($toEmail);
            $email->addContent('text/plain', $text);
            $email->addContent('text/html', $html);

            // List-Unsubscribe headers for native unsubscribe in email clients.
            $email->addHeader('List-Unsubscribe', '<' . $unsubscribeUrl . '>');
            $email->addHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');

            if ($this->showHeaderFavicon && $this->logoBase64 !== null) {
                $email->addAttachment($this->logoBase64, 'image/png', 'logo.png', 'inline', 'header-logo');
            }
            if ($this->showSignatureLogo && $this->brandLogoBase64 !== null) {
                $email->addAttachment($this->brandLogoBase64, 'image/png', 'brand-logo.png', 'inline', 'brand-logo');
            }

            $response = $this->client->send($email);
            $status   = $response->statusCode();
            if ($status >= 200 && $status < 300) {
                return true;
            }
            $this->lastSendError = 'HTTP ' . $status;
            $responseBody = $response->body();
            if ($responseBody !== '') {
                $decoded = json_decode($responseBody, true);
                if (is_array($decoded) && isset($decoded['errors'][0]['message'])) {
                    $this->lastSendError .= ': ' . $decoded['errors'][0]['message'];
                }
            }
            return false;
        } catch (\Throwable $e) {
            $this->lastSendError = $e->getMessage();
            return false;
        }
    }

    /** Error message from the last failed sendNewsletter() call. */
    private string $lastSendError = '';

    /**
     * Get the error message from the last failed send, if any.
     */
    public function getLastSendError(): string
    {
        return $this->lastSendError;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    /**
     * Derive a bare domain from FRONTEND_URL (strips protocol and trailing slash).
     * e.g. "https://example.com" → "example.com"
     */
    private function siteDomain(): string
    {
        $url = $_ENV['FRONTEND_URL'] ?? '';
        return (string) preg_replace('#^https?://#', '', rtrim($url, '/'));
    }

    /**
     * Sanitize an email subject line.
     *
     * Strips HTML/script tags and all ASCII control characters (including \r and \n
     * which enable email header injection). Safe for use with any user-supplied input.
     */
    private function sanitizeSubject(string $value): string
    {
        $value = strip_tags($value);
        return (string) preg_replace('/[\x00-\x1F\x7F]/', '', $value);
    }
}
