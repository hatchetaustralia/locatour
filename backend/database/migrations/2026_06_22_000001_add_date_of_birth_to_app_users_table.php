<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add date_of_birth to app_users for 13+ age verification.
 *
 * Nullable so existing/legacy callers that don't send a DOB continue to work.
 * When provided at registration, AccountController enforces age >= 13 before
 * creating the user row or issuing a token.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->date('date_of_birth')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->dropColumn('date_of_birth');
        });
    }
};
