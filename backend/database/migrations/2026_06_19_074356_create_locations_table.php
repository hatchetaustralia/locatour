<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            // Stable string id used by the Expo app (e.g. "mueller_park").
            // Mirrors ExploreLocation.id from src/types/index.ts.
            $table->string('slug')->unique();
            $table->string('name');
            $table->string('category'); // parks | scenic | food
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('address');
            $table->integer('points')->default(0);
            $table->text('description')->nullable();
            $table->json('image_urls')->nullable();
            $table->json('verification_tags')->nullable();
            // Check-in geofence radius in metres (app default CHECK_IN_RADIUS_M).
            $table->integer('geofence_radius_m')->default(50);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
