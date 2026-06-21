<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\JsonResponse;

/**
 * Public read-only endpoint the app polls (e.g. on launch) for the single live
 * announcement banner. Same pull model as the locations/achievements APIs — the
 * admin manages announcements in Filament; the app fetches the current one.
 */
class AnnouncementController extends Controller
{
    /** GET /api/announcement  (public) — the single live announcement, or null. */
    public function current(): JsonResponse
    {
        $announcement = Announcement::current();

        return response()->json([
            'announcement' => $announcement ? [
                'id' => $announcement->id,
                'title' => $announcement->title,
                'body' => $announcement->body,
                'level' => $announcement->level,
                'startsAt' => $announcement->starts_at?->toIso8601String(),
                'endsAt' => $announcement->ends_at?->toIso8601String(),
                'updatedAt' => $announcement->updated_at?->toIso8601String(),
            ] : null,
        ]);
    }
}
