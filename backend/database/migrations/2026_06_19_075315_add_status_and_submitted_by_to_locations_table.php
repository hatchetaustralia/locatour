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
        Schema::table('locations', function (Blueprint $table) {
            // Moderation state. The 5 seeded locations are 'approved';
            // contributor submissions start 'pending'. Only 'approved'
            // locations are returned by the public API.
            $table->string('status')->default('approved')->index()->after('active');
            // Who submitted this location (null for the original seeds /
            // admin-created). FK to users; null on user deletion.
            $table->foreignId('submitted_by')
                ->nullable()
                ->after('status')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropColumn('status');
        });
    }
};
