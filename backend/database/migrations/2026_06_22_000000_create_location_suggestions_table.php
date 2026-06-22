<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Community location suggestions submitted by app users from the map.
 *
 * These are DISTINCT from the admin contributor pending-location flow. An app
 * user submits a suggestion from their current GPS position; the proximity check
 * (enforced in SuggestionController) ensures they were actually on-site.
 *
 * Lifecycle:  pending → approved (creates a Location row) | rejected
 *
 * converted_location_id is set when a suggestion is approved and converted into
 * a real Location so the link is preserved for auditing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('location_suggestions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_user_id')
                ->nullable()
                ->constrained('app_users')
                ->nullOnDelete();
            $table->string('name')->nullable();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->text('notes')->nullable();
            // 'pending' | 'approved' | 'rejected'
            $table->string('status')->default('pending');
            $table->text('review_notes')->nullable();
            $table->foreignId('reviewed_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('converted_location_id')
                ->nullable()
                ->constrained('locations')
                ->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_suggestions');
    }
};
