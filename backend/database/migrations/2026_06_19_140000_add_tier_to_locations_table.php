<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the RuneScape-style location `tier` (1-10) used for level gating.
     * See docs/locatour/06-rich-locations-and-leveling-spec.md.
     *
     * `geofence_radius_m` already exists as an integer (default 50); the
     * widened 50-20000 range is enforced in the Filament form + API, not at
     * the column level (a plain integer already holds 20000).
     *
     * `image_urls` already exists as a JSON column — it now stores an ordered
     * mix of uploaded file paths (locations/...) and remote seed URLs.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->unsignedTinyInteger('tier')->default(1)->index()->after('points');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropIndex(['tier']);
            $table->dropColumn('tier');
        });
    }
};
