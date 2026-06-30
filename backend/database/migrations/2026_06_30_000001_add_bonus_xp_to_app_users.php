<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Separate admin-granted XP from earned XP. `total_xp` becomes a DERIVED value:
 * sum(check-in points_earned) + bonus_xp. This makes revoking a check-in
 * correctly remove its points (the server recomputes on every check-in
 * create/delete), and lets admin grants survive a recompute. Default 0 — existing
 * totals are reconciled by a one-off recalcXp() pass after deploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->integer('bonus_xp')->default(0)->after('total_xp');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->dropColumn('bonus_xp');
        });
    }
};
