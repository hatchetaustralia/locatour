<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A server-controlled settings store. Each row is one tunable value the
     * mobile app and backend read at runtime. Defaults are seeded (idempotently)
     * by SettingSeeder so every default equals the current hard-coded value —
     * ZERO behaviour change until an admin edits a row.
     */
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            // Canonical snake_case key (e.g. hidden_radius_m). Unique + indexed.
            $table->string('key')->unique();
            // Stored as a string; cast to int/float by `type` on read.
            $table->text('value')->nullable();
            // 'int' | 'float' — drives the cast in Setting::get().
            $table->string('type');
            // Admin-UI grouping (e.g. "Discovery & Radii").
            $table->string('group');
            $table->string('label');
            // Display unit (m, ×, h, …); null = unitless.
            $table->string('unit')->nullable();
            $table->text('description')->nullable();
            // Validation bounds for the admin editor.
            $table->integer('min')->nullable();
            $table->integer('max')->nullable();
            // Display order within the group.
            $table->integer('sort')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
