<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Public-facing metadata + Google Places (New) prefill fields, and the switch to
 * a points-driven tier (spec 07).
 *
 * Tier is now DERIVED from points (the compounded OSRS bands in
 * Location::DEFAULT_POINTS_FOR_TIER): admins set the points reward with a slider,
 * the tier badge follows. The `tier` column is kept (the app gates on it) but is
 * recomputed from points on every save (Location::tierForPoints). This migration
 * backfills existing rows so their tier matches their points.
 *
 * The metadata columns mirror the public-useful subset of the Places API (New)
 * Place fields, all nullable + editable (atmosphere data is sparse for natural
 * features, so a missing value means "unknown", never "no").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            // Why this tier — the per-location rationale (capacity / sensitivity /
            // exposure) the admin records, e.g. "huge, full facilities, can take
            // crowds" vs "fragile, no facilities, unpublicised".
            $table->text('tier_rationale')->nullable()->after('tier');

            // --- Visitor meta (prefilled from Places where available, editable) ---
            // Wheelchair accessibility: {entrance, parking, restroom, seating} bools.
            $table->json('accessibility')->nullable()->after('description');
            // Amenities present on site: ['parking','toilets','picnic_bbq',...].
            $table->json('amenities')->nullable()->after('accessibility');
            // Opening hours: {is_24_7: bool, weekday: string[], notes: string}.
            $table->json('opening_hours')->nullable()->after('amenities');
            $table->boolean('dog_friendly')->nullable()->after('opening_hours');
            $table->boolean('family_friendly')->nullable()->after('dog_friendly');

            // --- Public info sourced from Google Places (New) ---
            // The Places place id — storable indefinitely per Google ToS; used to
            // re-sync drifting fields (rating, hours, status) later.
            $table->string('place_id')->nullable()->index()->after('family_friendly');
            $table->timestamp('place_synced_at')->nullable()->after('place_id');
            // One-tap navigation target + address-less precise location.
            $table->string('directions_uri')->nullable()->after('place_synced_at');
            $table->string('plus_code')->nullable()->after('directions_uri');
            // Authority page + a number to check conditions before a remote trip.
            $table->string('website_uri')->nullable()->after('plus_code');
            $table->string('phone')->nullable()->after('website_uri');
            // Social proof.
            $table->decimal('google_rating', 2, 1)->nullable()->after('phone');
            $table->unsignedInteger('google_rating_count')->nullable()->after('google_rating');
            // "Is it free?" — FREE | INEXPENSIVE | MODERATE | EXPENSIVE | VERY_EXPENSIVE.
            $table->string('price_level')->nullable()->after('google_rating_count');
            // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY — don't drive to a closed gate.
            $table->string('business_status')->nullable()->after('price_level');
            // "Best for" badge: Beach / National Park / Lookout / Waterfall.
            $table->string('primary_type')->nullable()->after('business_status');
            $table->string('primary_type_label')->nullable()->after('primary_type');
            // Map bounding box {low:{lat,lng}, high:{lat,lng}} so large parks frame
            // sensibly instead of a single centroid pin.
            $table->json('viewport')->nullable()->after('primary_type_label');
        });

        // Backfill: derive tier from points for existing rows (ascending bands;
        // highest band whose threshold <= points wins, min tier 1).
        $bands = [1 => 100, 2 => 200, 3 => 350, 4 => 700, 5 => 1300, 6 => 2300, 7 => 4200, 8 => 8000, 9 => 14000, 10 => 22000];
        foreach (DB::table('locations')->select('id', 'points')->get() as $row) {
            $tier = 1;
            foreach ($bands as $t => $threshold) {
                if ((int) $row->points >= $threshold) {
                    $tier = $t;
                }
            }
            DB::table('locations')->where('id', $row->id)->update(['tier' => $tier]);
        }
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn([
                'tier_rationale', 'accessibility', 'amenities', 'opening_hours',
                'dog_friendly', 'family_friendly', 'place_id', 'place_synced_at',
                'directions_uri', 'plus_code', 'website_uri', 'phone',
                'google_rating', 'google_rating_count', 'price_level',
                'business_status', 'primary_type', 'primary_type_label', 'viewport',
            ]);
        });
    }
};
