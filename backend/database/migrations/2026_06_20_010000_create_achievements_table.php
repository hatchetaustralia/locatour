<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RuneScape-style tiered achievements (spec 08). Each is a single
 * machine-evaluable rule — `metric` compared against `threshold` — so the app
 * can award them generically and admins can add/manage them in Filament.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('achievements', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();          // stable id used by the app
            $table->string('title');
            $table->text('description');
            // Easy | Medium | Hard | Elite | Master | Grandmaster
            $table->string('difficulty')->index();
            $table->string('category')->nullable();   // flavour grouping
            // The metric the rule evaluates (total_checkins, day_streak, level, …).
            $table->string('metric');
            $table->unsignedInteger('threshold');
            $table->unsignedInteger('points')->default(50);
            $table->string('icon_name')->default('trophy-outline'); // Ionicons
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('achievements');
    }
};
