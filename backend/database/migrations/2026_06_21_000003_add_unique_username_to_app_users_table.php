<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Username is the public unique handle for an app user (the auth identifier —
// email/phone/SSO — comes in Phase 2). Enforce uniqueness at the DB layer as the
// safety net behind the availability check + client validation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->unique('username');
        });
    }

    public function down(): void
    {
        Schema::table('app_users', function (Blueprint $table) {
            $table->dropUnique(['username']);
        });
    }
};
