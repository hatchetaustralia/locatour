<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off data fix: round any legacy floating-point `points` values to whole
 * integers (e.g. 299.99999999999994 → 300). New writes are already rounded by
 * Location::saving + the whole-step admin slider; this cleans up rows seeded or
 * written before that. Safe to run repeatedly — already-whole rows are untouched.
 *
 * MUST also be run on production after deploy:  php artisan locations:round-points
 */
class RoundLocationPoints extends Command
{
    protected $signature = 'locations:round-points {--dry-run : Report how many rows would change without writing}';

    protected $description = 'Round any floating-point location points to whole integers';

    public function handle(): int
    {
        $affected = (int) DB::table('locations')->whereRaw('points <> ROUND(points)')->count();

        if ($this->option('dry-run')) {
            $this->info("{$affected} location(s) have non-integer points and would be rounded.");

            return self::SUCCESS;
        }

        if ($affected === 0) {
            $this->info('No non-integer points found — nothing to do.');

            return self::SUCCESS;
        }

        $updated = DB::table('locations')
            ->whereRaw('points <> ROUND(points)')
            ->update(['points' => DB::raw('ROUND(points)')]);

        $this->info("Rounded points on {$updated} location(s).");

        return self::SUCCESS;
    }
}
