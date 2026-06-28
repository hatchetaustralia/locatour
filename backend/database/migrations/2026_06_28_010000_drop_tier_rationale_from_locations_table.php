<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the unused `tier_rationale` column. The admin "Why this tier?" input was
 * removed, the app never reads `tierRationale`, and the API field is gone — the
 * column is now dead. Tier is derived from points (see Location::tierForPoints).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('locations', 'tier_rationale')) {
            Schema::table('locations', function (Blueprint $table): void {
                $table->dropColumn('tier_rationale');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('locations', 'tier_rationale')) {
            Schema::table('locations', function (Blueprint $table): void {
                $table->text('tier_rationale')->nullable()->after('tier');
            });
        }
    }
};
