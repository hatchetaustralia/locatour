<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The category -> tag taxonomy.
     *
     *   categories : the 9 fixed profile interests (hiking, camping, ...),
     *                each with an Ionicons `icon` name.
     *   tags       : creatable sub-labels that belong to one category
     *                (e.g. Hiking -> "summit", "coastal trail").
     *   location_tag : pivot. A location's categories are DERIVED from the
     *                distinct categories of its tags.
     */
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('icon')->nullable(); // Ionicons name, e.g. "trail-sign-outline".
            $table->timestamps();
        });

        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->timestamps();

            // Slugs are unique within a category, not globally.
            $table->unique(['category_id', 'slug']);
        });

        Schema::create('location_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tag_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['location_id', 'tag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_tag');
        Schema::dropIfExists('tags');
        Schema::dropIfExists('categories');
    }
};
