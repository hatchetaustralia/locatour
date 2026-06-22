<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Base/home location coordinates + change-throttling columns on app_users.
 *
 * home_lat / home_lng  — the geocoded coordinates of the user's home_suburb.
 *   Used as a warm-start anchor for the map (so it opens localized instead of
 *   defaulting to a city centre and snapping once GPS resolves).
 *
 * Base location is a TRUST-SENSITIVE input: surfacing spots near an arbitrary
 * self-declared point would let someone "teleport" their discovery radius around
 * the map without travelling. So changing it is throttled SERVER-SIDE via an
 * escalating, PIN-lockout-style cooldown (AccountController::baseLocation):
 *   home_changed_at      — when the base was last set/changed (cooldown anchor).
 *   home_change_count    — number of CHANGES made after the initial onboarding set.
 *   home_change_attempts — change attempts rejected during an active cooldown
 *                          (the "wrong PIN" counter); repeated attempts raise a
 *                          base_location_churn flag for admin review (no auto-ban —
 *                          the cooldown itself is the enforcement).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->decimal('home_lat', 10, 7)->nullable()->after('home_suburb');
            $table->decimal('home_lng', 10, 7)->nullable()->after('home_lat');
            $table->timestamp('home_changed_at')->nullable()->after('home_lng');
            $table->unsignedInteger('home_change_count')->default(0)->after('home_changed_at');
            $table->unsignedInteger('home_change_attempts')->default(0)->after('home_change_count');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->dropColumn([
                'home_lat',
                'home_lng',
                'home_changed_at',
                'home_change_count',
                'home_change_attempts',
            ]);
        });
    }
};
