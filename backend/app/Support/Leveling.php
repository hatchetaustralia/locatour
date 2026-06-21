<?php

namespace App\Support;

/**
 * Server-side mirror of the app's progression curve (src/utils/leveling.ts).
 *
 * The mobile app is the source of truth for a user's XP and computes their level
 * locally; the backend only needs this when an admin edits XP directly (e.g. the
 * "grant points" action on the AppUser view) so it can recompute the resulting
 * level with the SAME authentic OSRS formula. Keep this in lock-step with
 * leveling.ts — the milestone tests pin the curve.
 */
class Leveling
{
    /** The authentic OSRS level cap. */
    public const MAX_LEVEL = 99;

    /**
     * Cumulative XP required to *reach* a level, OSRS formula:
     *   xpForLevel(L) = floor( (1/4) · Σ_{ℓ=1}^{L−1} floor( ℓ + 300 · 2^(ℓ/7) ) )
     * Level 1 = 0 XP. Verified milestones: L2=83, L10=1,154, L99=13,034,431.
     */
    public static function xpForLevel(int $level): int
    {
        if ($level <= 1) {
            return 0;
        }

        $sum = 0;
        for ($l = 1; $l <= $level - 1; $l++) {
            $sum += (int) floor($l + 300 * (2 ** ($l / 7)));
        }

        return (int) floor($sum / 4);
    }

    /** @var array<int, int>|null Cumulative XP thresholds, index = level. */
    private static ?array $table = null;

    /** @return array<int, int> */
    private static function table(): array
    {
        if (self::$table === null) {
            self::$table = [0 => 0];
            for ($lvl = 1; $lvl <= self::MAX_LEVEL; $lvl++) {
                self::$table[$lvl] = self::xpForLevel($lvl);
            }
        }

        return self::$table;
    }

    /**
     * The level (1..MAX_LEVEL) for a cumulative XP total. Negative XP → level 1;
     * clamped at the cap.
     */
    public static function levelForXp(int $totalXp): int
    {
        $xp = max(0, $totalXp);
        $table = self::table();
        $level = 1;
        for ($l = 2; $l <= self::MAX_LEVEL; $l++) {
            if ($xp >= $table[$l]) {
                $level = $l;
            } else {
                break;
            }
        }

        return $level;
    }
}
