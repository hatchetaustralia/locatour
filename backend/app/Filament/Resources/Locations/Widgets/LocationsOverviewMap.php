<?php

namespace App\Filament\Resources\Locations\Widgets;

use App\Filament\Resources\Locations\LocationResource;
use App\Models\Location;
use Filament\Widgets\Widget;

/**
 * An overview map shown above the Locations list table. Plots every location
 * the current user can see (the LocationResource query already scopes
 * contributors to their own submissions) so admins can manage them visually.
 *
 * Custom widget (Blade + the Google Maps JavaScript API) — see spec 06 §5 and
 * the LocationMapPicker note on plugin compatibility.
 */
class LocationsOverviewMap extends Widget
{
    protected string $view = 'filament.resources.locations.widgets.locations-overview-map';

    protected int|string|array $columnSpan = 'full';

    /**
     * Pin data for the map: every location's coordinates, name, tier, status
     * and a deep link to its edit page.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getPins(): array
    {
        return Location::query()
            ->select(['id', 'slug', 'name', 'latitude', 'longitude', 'tier', 'points', 'status', 'category'])
            ->get()
            ->map(fn (Location $location): array => [
                'name' => $location->name,
                'lat' => (float) $location->latitude,
                'lng' => (float) $location->longitude,
                'tier' => (int) $location->tier,
                'points' => (int) $location->points,
                'status' => $location->status,
                'category' => $location->category,
                'editUrl' => LocationResource::getUrl('edit', ['record' => $location]),
            ])
            ->all();
    }

    public function getApiKey(): ?string
    {
        return config('services.google_maps_key');
    }
}
