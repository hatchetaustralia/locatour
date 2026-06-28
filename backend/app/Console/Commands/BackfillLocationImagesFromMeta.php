<?php

namespace App\Console\Commands;

use App\Models\Location;
use Illuminate\Console\Command;

/**
 * One-off backfill: locations synced from Google Places BEFORE the sync started
 * writing photos into `image_urls` have their photos only in the
 * `meta.photo_urls` cache, so the app/admin gallery shows nothing. This folds
 * each location's cached Places photos into its real `image_urls`, de-duped.
 *
 * Idempotent and safe to re-run — already-present URLs are skipped, and going
 * forward every sync does this automatically (SyncsLocationFromPlaces).
 *
 * Run on prod after deploy:  php artisan locations:backfill-images
 */
class BackfillLocationImagesFromMeta extends Command
{
    protected $signature = 'locations:backfill-images {--dry-run : Report how many locations would change without writing}';

    protected $description = 'Merge cached Google Places photos (meta.photo_urls) into locations.image_urls';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $changed = 0;

        Location::query()
            ->whereHas('meta')
            ->with('meta')
            ->chunkById(200, function ($locations) use (&$changed, $dryRun): void {
                foreach ($locations as $location) {
                    $photos = array_values(array_filter((array) ($location->meta?->photo_urls ?? [])));
                    if ($photos === []) {
                        continue;
                    }

                    $existing = array_values(array_filter((array) $location->image_urls));
                    $merged = array_values(array_unique(array_merge($existing, $photos)));

                    if ($merged === $existing) {
                        continue;
                    }

                    $changed++;

                    if (! $dryRun) {
                        $location->image_urls = $merged;
                        $location->save();
                    }
                }
            });

        $this->info($dryRun
            ? "{$changed} location(s) would gain cached Places photos in image_urls."
            : "Backfilled image_urls on {$changed} location(s).");

        return self::SUCCESS;
    }
}
