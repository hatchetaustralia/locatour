<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extensible per-account flag table.
 *
 * Each row represents one flag raised against an AppUser account. Flags are
 * typed (e.g. 'scraping') so multiple flag reasons can coexist and be resolved
 * independently. A flag is "active" (unresolved) while resolved_at is null.
 *
 * To add a future flag type: add a new TYPE_* constant to AccountFlag and call
 * $appUser->flagFor(AccountFlag::TYPE_NEW, 'reason') in the relevant code path.
 *
 * resolved_by_id references the Filament admin User who cleared the flag.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_user_id')
                ->constrained('app_users')
                ->cascadeOnDelete();
            // Flag type identifier — use AccountFlag::TYPE_* constants.
            $table->string('type');
            $table->text('reason');
            $table->json('details')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamps();

            // Index for the common "all unresolved flags for a user" query.
            $table->index(['app_user_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_flags');
    }
};
