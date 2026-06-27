<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * App-user activity tracking. `last_login_at` + `login_count` are written each
 * time an app user completes Google sign-in (AuthController). `last_seen_at` is
 * touched on authenticated API activity by TouchAppUserLastSeen middleware, but
 * throttled (~5 min) so it isn't a DB write on every request.
 *
 * All nullable / default 0 so existing rows are valid without a backfill.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->timestamp('last_login_at')->nullable()->after('status');
            $table->timestamp('last_seen_at')->nullable()->after('last_login_at');
            $table->unsignedInteger('login_count')->default(0)->after('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->dropColumn(['last_login_at', 'last_seen_at', 'login_count']);
        });
    }
};
