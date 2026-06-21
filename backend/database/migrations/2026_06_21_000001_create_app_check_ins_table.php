<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Check-ins recorded by mobile app users, with optional uploaded photo.
 * `location_id` is the app's string slug (matches locations.slug) rather than
 * a hard FK, so check-ins survive even if a location is removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_check_ins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_user_id')
                ->constrained('app_users')
                ->cascadeOnDelete();
            $table->string('location_id');
            $table->string('location_name')->nullable();
            $table->integer('points_earned')->default(0);
            // Path on the public disk (null when no photo uploaded).
            $table->string('photo_path')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('verified_offline')->default(false);
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_check_ins');
    }
};
