<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

/**
 * Seeds the server-controlled settings store with defaults that EQUAL the
 * current hard-coded values, so seeding changes nothing until an admin edits.
 *
 * Idempotent: keyed on `key`, so re-running never duplicates and never
 * overwrites an admin-edited `value`. It only inserts missing keys (with the
 * default value), and refreshes metadata (label/group/min/max/unit/description/
 * sort/type) on existing rows so admin labels/bounds stay current.
 */
class SettingSeeder extends Seeder
{
    public function run(): void
    {
        // group => [ ordered settings ]. `sort` is assigned by array order
        // within each group.
        $groups = [
            'Discovery & Radii' => [
                [
                    'key' => 'hidden_radius_m',
                    'type' => 'int',
                    'default' => 50,
                    'label' => 'Hidden spot find/unlock radius',
                    'unit' => 'm',
                    'min' => 5,
                    'max' => 2000,
                    'description' => 'How close you must be to FIND/unlock a hidden spot (you-found-it takeover).',
                ],
                [
                    'key' => 'warm_radius_m',
                    'type' => 'int',
                    'default' => 500,
                    'label' => 'Hidden "nearby" teaser radius',
                    'unit' => 'm',
                    'min' => 50,
                    'max' => 5000,
                    'description' => 'How close before the "something hidden nearby" teaser appears.',
                ],
                [
                    'key' => 'check_in_radius_m',
                    'type' => 'int',
                    'default' => 50,
                    'label' => 'Check-in radius',
                    'unit' => 'm',
                    'min' => 5,
                    'max' => 2000,
                    'description' => 'How close you must be to a location to check in.',
                ],
                [
                    'key' => 'reveal_radius_m',
                    'type' => 'int',
                    'default' => 2000,
                    'label' => 'Proximity reveal radius (above-tier)',
                    'unit' => 'm',
                    'min' => 100,
                    'max' => 20000,
                    'description' => 'Server surfaces above-your-tier spots within this radius of your GPS.',
                ],
                [
                    'key' => 'vicinity_radius_m',
                    'type' => 'int',
                    'default' => 10000,
                    'label' => 'Map vicinity radius',
                    'unit' => 'm',
                    'min' => 1000,
                    'max' => 100000,
                    'description' => 'Radius of locations shown around you on the map.',
                ],
                [
                    'key' => 'reach_radius_m',
                    'type' => 'int',
                    'default' => 200000,
                    'label' => 'Reachable fetch radius',
                    'unit' => 'm',
                    'min' => 10000,
                    'max' => 1000000,
                    'description' => 'How far out locations are fetched as "reachable".',
                ],
                [
                    'key' => 'default_search_radius_m',
                    'type' => 'int',
                    'default' => 200000,
                    'label' => 'API default search radius',
                    'unit' => 'm',
                    'min' => 10000,
                    'max' => 1000000,
                    'description' => 'Default radius the /api/locations endpoint uses when none is passed.',
                ],
            ],
            'Points & Multipliers' => [
                [
                    'key' => 'discovery_multiplier',
                    'type' => 'float',
                    'default' => 3,
                    'label' => 'First-find discovery multiplier',
                    'unit' => '×',
                    'min' => 1,
                    'max' => 10,
                    'description' => 'Points multiplier the first time a spot is discovered.',
                ],
                [
                    'key' => 'nearby_alerts_multiplier',
                    'type' => 'float',
                    'default' => 1.2,
                    'label' => 'Nearby-alert bonus multiplier',
                    'unit' => '×',
                    'min' => 1,
                    'max' => 3,
                    'description' => 'Bonus multiplier for checking in via a nearby push alert.',
                ],
                [
                    'key' => 'radius_tier_boost_pct',
                    'type' => 'int',
                    'default' => 10,
                    'label' => 'Per-tier radius boost',
                    'unit' => '%',
                    'min' => 0,
                    'max' => 200,
                    'description' => 'Flat (non-compounding) boost to the discovery (warm) and localised-locations (vicinity) radii per tier above tier 1: tier 2 (level 10) → +10%, tier 10 (level 90) → +90%. Check-in radius is unaffected.',
                ],
            ],
            'Cooldowns & Ranges' => [
                [
                    'key' => 'checkin_cooldown_h',
                    'type' => 'int',
                    'default' => 24,
                    'label' => 'Check-in cooldown',
                    'unit' => 'h',
                    'min' => 0,
                    'max' => 168,
                    'description' => 'Hours before you can re-check-in at the same spot for points.',
                ],
                [
                    'key' => 'hidden_tier_range',
                    'type' => 'int',
                    'default' => 3,
                    'label' => 'Hidden tier range above level',
                    'unit' => '',
                    'min' => 0,
                    'max' => 10,
                    'description' => 'How many tiers above the user a hidden spot can be.',
                ],
                [
                    'key' => 'lock_teaser_range',
                    'type' => 'int',
                    'default' => 2,
                    'label' => 'Locked teaser tier range',
                    'unit' => '',
                    'min' => 0,
                    'max' => 10,
                    'description' => 'How many tiers above the user locked teaser spots show.',
                ],
            ],
        ];

        foreach ($groups as $group => $settings) {
            foreach (array_values($settings) as $sort => $s) {
                // Metadata is always refreshed; `value` is set ONLY on insert
                // (firstOrNew), so an admin-edited value is never clobbered.
                $row = Setting::firstOrNew(['key' => $s['key']]);

                if (! $row->exists) {
                    // Store the default as a string (cast back on read).
                    $row->value = (string) $s['default'];
                }

                $row->fill([
                    'type' => $s['type'],
                    'group' => $group,
                    'label' => $s['label'],
                    'unit' => $s['unit'],
                    'description' => $s['description'],
                    'min' => $s['min'],
                    'max' => $s['max'],
                    'sort' => $sort,
                ])->save();
            }
        }

        // DatabaseSeeder runs with WithoutModelEvents, so the saved() cache-flush
        // hook does NOT fire here. Flush explicitly so a re-seed against a warm
        // (database-driver) cache can't serve stale values.
        Setting::flushCache();
    }
}
