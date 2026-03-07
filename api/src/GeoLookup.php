<?php

declare(strict_types=1);

namespace CmsAcc;

/**
 * Best-effort IP geolocation via ip-api.com (free, no API key).
 *
 * Returns country, city, region on success. Returns empty array on failure.
 * Uses a 2-second timeout — the submission is still stored either way.
 */
final class GeoLookup
{
    private const TIMEOUT_SECONDS = 2;
    private const API_URL = 'http://ip-api.com/json/';

    /**
     * Look up geolocation for an IP address.
     *
     * @return array<string, string>
     */
    public static function lookup(string $ip): array
    {
        // Skip private/reserved IPs (local dev, loopback, etc.).
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return [];
        }

        $url = self::API_URL . rawurlencode($ip) . '?fields=country,city,regionName,countryCode';

        $ctx = stream_context_create([
            'http' => [
                'timeout' => self::TIMEOUT_SECONDS,
                'method'  => 'GET',
                'header'  => "Accept: application/json\r\n",
            ],
        ]);

        $json = @file_get_contents($url, false, $ctx);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);
        if (!is_array($data) || ($data['status'] ?? '') !== 'success') {
            return [];
        }

        $result = [];
        if (!empty($data['country']))      $result['country']     = (string) $data['country'];
        if (!empty($data['city']))          $result['city']        = (string) $data['city'];
        if (!empty($data['regionName']))    $result['region']      = (string) $data['regionName'];
        if (!empty($data['countryCode']))   $result['countryCode'] = (string) $data['countryCode'];

        return $result;
    }
}
