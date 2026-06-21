<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mobile-app end users (distinct from the Filament admin `users` table).
 * Keyed by the app's local device-generated uid (`device_id`) so Phase 1
 * lightweight auth works; Phase 2 (Firebase OTP + SSO) hangs off this same row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_users', function (Blueprint $table) {
            $table->id();
            // The app's stable local uid (e.g. "user_ab12cd").
            $table->string('device_id')->unique()->index();
            $table->string('display_name');
            $table->string('username');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('bio')->nullable();
            $table->string('avatar_url')->nullable();
            $table->string('gender')->nullable();
            $table->string('home_suburb')->nullable();
            $table->json('interests')->nullable();
            $table->integer('total_xp')->default(0);
            $table->integer('current_level')->default(1);
            $table->integer('day_streak')->default(0);
            // "active" | "blocked"
            $table->string('status')->default('active');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_users');
    }
};
