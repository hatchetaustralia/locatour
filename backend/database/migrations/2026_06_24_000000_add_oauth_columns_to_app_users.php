<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * SSO identity columns. `email`, `phone` and `avatar_url` already exist, so a
     * provider only needs its stable id here. Each id is nullable + unique so one
     * account can LINK multiple providers (augment model — Google now, Apple/phone
     * later). `auth_provider` records how the account was primarily created.
     */
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->string('google_id')->nullable()->unique()->after('device_id');
            $table->string('apple_id')->nullable()->unique()->after('google_id');
            $table->string('auth_provider')->default('device')->after('apple_id');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table): void {
            $table->dropColumn(['google_id', 'apple_id', 'auth_provider']);
        });
    }
};
