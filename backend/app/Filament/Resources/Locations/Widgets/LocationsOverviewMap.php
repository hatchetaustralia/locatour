<?php

namespace App\Filament\Resources\Locations\Widgets;

use App\Filament\Resources\Locations\Pages\ListLocations;
use App\Models\Location;
use Filament\Widgets\Concerns\InteractsWithPageTable;
use Filament\Widgets\Widget;

/**
 * An overview map shown above the Locations list table. Plots every location
 * the current user can see (the LocationResource query already scopes
 * contributors to their own submissions) so admins can manage them visually.
 *
 * Custom widget (Blade + the Google Maps JavaScript API) — see spec 06 §5 and
 * the LocationMapPicker note on plugin compatibility.
 *
 * UNIFIED FILTER: this widget pulls its pins from the SAME query the list
 * table uses (via InteractsWithPageTable::getPageTableQuery), so the status +
 * tier SelectFilters above the table drive the map markers and the table rows
 * at the same time. The trait exposes #[Reactive] $tableFilters, so when an
 * admin changes a filter the widget re-renders and the markers reduce to match.
 */
class LocationsOverviewMap extends Widget
{
    use InteractsWithPageTable;

    protected string $view = 'filament.resources.locations.widgets.locations-overview-map';

    protected int|string|array $columnSpan = 'full';

    /**
     * The list page whose table filters/search/sort this widget mirrors.
     */
    protected function getTablePage(): string
    {
        return ListLocations::class;
    }

    /**
     * Lightweight pin data for the map — JUST what's needed to plot a marker
     * and shape its icon: id, coordinates, tier, category and status. The rich
     * popup content (image, points, check-in count, address, edit link) is
     * fetched lazily per-marker on click via getPopupUrlBase(), so this array
     * stays small even with ~1000 locations.
     *
     * Reads the list table's FILTERED query so the status/tier filters above
     * the table reduce the map markers in lock-step with the table rows.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getPins(): array
    {
        return $this->getPageTableQuery()
            ->select(['id', 'latitude', 'longitude', 'tier', 'status', 'category'])
            ->reorder()
            ->get()
            ->map(fn (Location $location): array => [
                'id' => $location->id,
                'lat' => (float) $location->latitude,
                'lng' => (float) $location->longitude,
                'tier' => (int) $location->tier,
                'status' => $location->status,
                'category' => $location->category,
            ])
            ->all();
    }

    /**
     * Base URL for the per-location popup endpoint. The map JS appends the pin's
     * id and a "/popup" suffix (see the "__ID__" placeholder it replaces).
     */
    public function getPopupUrlBase(): string
    {
        return url('/admin/locations/__ID__/popup');
    }

    public function getApiKey(): ?string
    {
        return config('services.google_maps_key');
    }
}
