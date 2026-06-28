<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 1:1 sidecar table for Google Places enrichment of a location.
 *
 * The location row already carries the curated, app-facing Places subset
 * (rating, hours, website … see add_public_metadata_to_locations_table). This
 * table is the FULL enrichment cache: the complete raw Place Details response
 * ("pull everything"), the downloaded photo URLs, and a `synced_at` marker — so
 * re-enriching, regenerating copy, or auditing what Google returned doesn't
 * bloat the core locations table. Kept 1:1 (unique location_id) and cascades on
 * delete.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('location_meta', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')
                ->unique()
                ->constrained('locations')
                ->cascadeOnDelete();

            $table->string('google_place_id')->nullable()->index();
            $table->decimal('rating', 2, 1)->nullable();
            $table->unsignedInteger('user_ratings_total')->nullable();
            // 0-4 (FREE … VERY_EXPENSIVE) normalised from the New API enum.
            $table->unsignedTinyInteger('price_level')->nullable();
            $table->string('business_status')->nullable();
            $table->string('website')->nullable();
            $table->string('phone')->nullable();
            $table->json('opening_hours')->nullable();
            $table->json('types')->nullable();
            $table->text('editorial_summary')->nullable();
            // Public URLs of photos downloaded to the `public` disk (R2 in prod).
            $table->json('photo_urls')->nullable();
            // The full untouched Place Details response — nothing thrown away.
            $table->json('raw')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_meta');
    }
};
