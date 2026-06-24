<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-check-in public share token. Unguessable (random), minted lazily the first
 * time the user taps "Share", so a check-in is private until explicitly shared.
 * Powers the public /c/{token} page used to promote the app externally.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_check_ins', function (Blueprint $table) {
            $table->string('share_token', 32)->nullable()->unique()->after('photo_path');
        });
    }

    public function down(): void
    {
        Schema::table('app_check_ins', function (Blueprint $table) {
            $table->dropUnique(['share_token']);
            $table->dropColumn('share_token');
        });
    }
};
