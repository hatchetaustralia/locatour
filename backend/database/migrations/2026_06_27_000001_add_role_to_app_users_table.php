<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * App-level role on the mobile-player record (App\Models\AppUser).
 *
 * This is SEPARATE from the Filament/admin `users` table and its Spatie roles —
 * it does NOT grant Filament panel access. It's the foundation for in-app
 * privileges + admin management of players.
 *
 * NOT NULL with a 'player' default so every existing row is valid without a
 * backfill (existing players become 'player'). Allowed values are defined as
 * constants on AppUser: player | collaborator | admin | super_admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->string('role')->default('player')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->dropColumn('role');
        });
    }
};
