<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Phone
{
    /** Strip to digits only for comparison. */
    public static function digits(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    /**
     * Normalize for matching (handles +94 / 94 / leading 0 for Sri Lanka).
     *
     * @return string[] Candidate digit strings to compare.
     */
    public static function match_candidates(string $phone): array
    {
        $digits = self::digits($phone);
        if ($digits === '') {
            return [];
        }

        $candidates = [$digits];

        // Sri Lanka: +94771234567 → 94771234567 and 771234567
        if (strpos($digits, '94') === 0 && strlen($digits) >= 11) {
            $candidates[] = substr($digits, 2);
        }
        if (strpos($digits, '0') === 0 && strlen($digits) >= 10) {
            $candidates[] = substr($digits, 1);
            $candidates[] = '94' . substr($digits, 1);
        }
        if (strlen($digits) === 9 && $digits[0] === '7') {
            $candidates[] = '0' . $digits;
            $candidates[] = '94' . $digits;
        }

        return array_values(array_unique(array_filter($candidates)));
    }

    public static function phones_match(string $a, string $b): bool
    {
        $ca = self::match_candidates($a);
        $cb = self::match_candidates($b);
        if ($ca === [] || $cb === []) {
            return false;
        }
        foreach ($ca as $left) {
            foreach ($cb as $right) {
                if ($left === $right) {
                    return true;
                }
                // Match last 9 digits (mobile) when lengths differ
                if (strlen($left) >= 9 && strlen($right) >= 9
                    && substr($left, -9) === substr($right, -9)) {
                    return true;
                }
            }
        }
        return false;
    }
}
