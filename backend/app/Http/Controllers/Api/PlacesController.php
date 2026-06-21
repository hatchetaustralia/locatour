<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Server-side proxy for Google Places (New) autocomplete.
 *
 * The app must NOT hold a Maps key that can make arbitrary REST calls, so the
 * suburb lookup in onboarding hits this endpoint instead and we attach the
 * server's key here. Restricted to locality/sublocality results in Australia so
 * it behaves like a "suburb" picker.
 */
class PlacesController extends Controller
{
    public function suburbs(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        if (mb_strlen($query) < 2) {
            return response()->json(['suggestions' => []]);
        }

        $key = config('services.google_maps_key');
        if (! $key) {
            return response()->json(['suggestions' => [], 'error' => 'maps key not configured'], 200);
        }

        try {
            $response = Http::timeout(6)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'X-Goog-Api-Key' => $key,
                    // Limit the payload to the fields we actually use.
                    'X-Goog-FieldMask' => 'suggestions.placePrediction.text.text,suggestions.placePrediction.placeId',
                ])
                ->post('https://places.googleapis.com/v1/places:autocomplete', [
                    'input' => $query,
                    'includedPrimaryTypes' => ['locality', 'sublocality'],
                    'includedRegionCodes' => ['au'],
                ]);

            if (! $response->successful()) {
                return response()->json([
                    'suggestions' => [],
                    'error' => 'places request failed',
                    'status' => $response->status(),
                ], 200);
            }

            $suggestions = collect($response->json('suggestions', []))
                ->map(function ($s) {
                    $prediction = $s['placePrediction'] ?? null;
                    if (! $prediction) {
                        return null;
                    }

                    return [
                        'description' => $prediction['text']['text'] ?? null,
                        'placeId' => $prediction['placeId'] ?? null,
                    ];
                })
                ->filter(fn ($s) => $s && $s['description'])
                ->values()
                ->all();

            return response()->json(['suggestions' => $suggestions]);
        } catch (\Throwable $e) {
            // Never block onboarding on a lookup failure — the app falls back to
            // free-typed text.
            return response()->json(['suggestions' => [], 'error' => 'lookup unavailable'], 200);
        }
    }
}
