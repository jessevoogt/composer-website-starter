<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Lightweight user-agent parser.
 *
 * Extracts browser name + version and OS from the UA string via regex.
 * Best-effort — the raw UA is always stored alongside parsed values.
 */
final class UserAgentParser
{
    /**
     * Parse a user agent string into browser and OS components.
     *
     * @return array{browser: string, os: string}
     */
    public static function parse(string $ua): array
    {
        return [
            'browser' => self::parseBrowser($ua),
            'os'      => self::parseOs($ua),
        ];
    }

    private static function parseBrowser(string $ua): string
    {
        // Order matters — check specific browsers before generic engines.
        $patterns = [
            '/Edg(?:e|A|iOS)?\/(\d+[\.\d]*)/'  => 'Edge',
            '/OPR\/(\d+[\.\d]*)/'               => 'Opera',
            '/Vivaldi\/(\d+[\.\d]*)/'            => 'Vivaldi',
            '/SamsungBrowser\/(\d+[\.\d]*)/'     => 'Samsung Internet',
            '/Firefox\/(\d+[\.\d]*)/'            => 'Firefox',
            '/FxiOS\/(\d+[\.\d]*)/'             => 'Firefox',
            '/CriOS\/(\d+[\.\d]*)/'             => 'Chrome',
            '/Chrome\/(\d+[\.\d]*)/'             => 'Chrome',
        ];

        foreach ($patterns as $pattern => $name) {
            if (preg_match($pattern, $ua, $m)) {
                return "{$name} {$m[1]}";
            }
        }

        // Safari reports its version via Version/x.x, not Safari/xxx.
        if (preg_match('/Safari\/[\d.]+/', $ua) && preg_match('/Version\/([\d.]+)/', $ua, $sv)) {
            return "Safari {$sv[1]}";
        }

        return 'Unknown';
    }

    private static function parseOs(string $ua): string
    {
        if (preg_match('/Windows NT ([\d.]+)/', $ua, $m)) {
            $ver = match ($m[1]) {
                '10.0' => '10+',
                '6.3'  => '8.1',
                '6.2'  => '8',
                '6.1'  => '7',
                default => $m[1],
            };
            return "Windows {$ver}";
        }

        if (preg_match('/Mac OS X ([\d_]+)/', $ua, $m)) {
            return 'macOS ' . str_replace('_', '.', $m[1]);
        }

        if (preg_match('/Android ([\d.]+)/', $ua, $m)) {
            return "Android {$m[1]}";
        }

        if (preg_match('/iPhone OS ([\d_]+)/', $ua, $m)) {
            return 'iOS ' . str_replace('_', '.', $m[1]);
        }

        if (preg_match('/iPad.*OS ([\d_]+)/', $ua, $m)) {
            return 'iPadOS ' . str_replace('_', '.', $m[1]);
        }

        if (preg_match('/CrOS/', $ua)) {
            return 'ChromeOS';
        }

        if (preg_match('/Linux/', $ua)) {
            return 'Linux';
        }

        return 'Unknown';
    }
}
