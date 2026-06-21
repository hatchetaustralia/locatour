<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Volume-based scrape-detection columns on app_users.
 *
 * last_location_query_at — start of the current location-query counting window.
 * suspicious_query_count — number of location queries seen in that window.
 *
 * MonitorLocationQueries flags (and, at an egregious rate, auto-blocks) accounts
 * whose query VOLUME within a rolling window looks automated. Implied GPS speed
 * is deliberately NOT used: the request lat/lng is the map-view centre, not the
 * device position, so panning the map is normal use, not "teleporting". The flag
 * itself lives in account_flags so multiple flag types can coexist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->timestamp('last_location_query_at')->nullable()->after('status');
            $table->unsignedInteger('suspicious_query_count')->default(0)->after('last_location_query_at');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->dropColumn([
                'last_location_query_at',
                'suspicious_query_count',
            ]);
        });
    }
};
