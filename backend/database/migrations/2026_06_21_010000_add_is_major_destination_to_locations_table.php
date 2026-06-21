<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Major destination" flag for the local-first visibility rule.
 *
 * Most locations are only visible to a player physically within ~10km, but
 * marquee landmarks (Sydney Harbour Bridge, Eiffel Tower, Kings Park) are always
 * visible globally. This flag marks those — false for everything else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->boolean('is_major_destination')->default(false)->after('tier');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn('is_major_destination');
        });
    }
};
