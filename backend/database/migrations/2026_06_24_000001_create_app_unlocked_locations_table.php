<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hidden spots an app user has UNLOCKED by reaching them (within range), so the
     * unlock persists server-side and restores on sign-in / a new device. (Until
     * now unlocks were local-only.) One row per (user, location).
     */
    public function up(): void
    {
        Schema::create('app_unlocked_locations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('app_user_id')->constrained('app_users')->cascadeOnDelete();
            $table->string('location_id');
            $table->timestamps();
            $table->unique(['app_user_id', 'location_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_unlocked_locations');
    }
};
