<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Verification metadata for check-ins, surfaced in the admin "View" detail panel
 * so a check-in can be vetted (how accurate was the GPS fix, what did the camera
 * record). Both are nullable — older check-ins and offline/web fallbacks won't
 * have them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_check_ins', function (Blueprint $table) {
            // Reported horizontal accuracy of the GPS fix, in metres (lower = better).
            $table->decimal('gps_accuracy', 8, 2)->nullable()->after('longitude');
            // Raw EXIF tags from the captured photo (device make/model, capture
            // timestamp, GPS, etc.) — shape varies by device/OS, so stored as-is.
            $table->json('photo_exif')->nullable()->after('gps_accuracy');
        });
    }

    public function down(): void
    {
        Schema::table('app_check_ins', function (Blueprint $table) {
            $table->dropColumn(['gps_accuracy', 'photo_exif']);
        });
    }
};
