<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\LocationResource;
use App\Filament\Resources\Locations\Widgets\LocationsOverviewMap;
use App\Models\Location;
use Filament\Actions\CreateAction;
use Filament\Pages\Concerns\ExposesTableToWidgets;
use Filament\Resources\Pages\ListRecords;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Html;
use Filament\Schemas\Schema;

class ListLocations extends ListRecords
{
    // The overview-map header widget mirrors this page's table state (status +
    // tier filters, search, sort) via InteractsWithPageTable's #[Reactive] props.
    // ExposesTableToWidgets supplies getWidgetData() so those reactive props are
    // hydrated with the page's actual table state on every Livewire round-trip.
    // Without it getWidgetData() returns [] and the non-nullable typed reactive
    // props (e.g. array $tableColumnSearches) receive null when a filter applies,
    // throwing a TypeError. See the unified-filter note on LocationsOverviewMap.
    use ExposesTableToWidgets;

    protected static string $resource = LocationResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }

    /**
     * The page-level filter bar sits above the overview-map header widget so the
     * layout is: heading → filters → map → table.
     *
     * The two <select> elements bind via wire:model.live directly to
     * tableFilters[status][value] and tableFilters[tier][value] — the same
     * #[Url] Livewire property that Filament's SelectFilter reads from.  This
     * means changing either dropdown fires a Livewire update that:
     *   1. Re-runs the table query (filtered rows update immediately).
     *   2. Triggers ExposesTableToWidgets → getWidgetData() returns the new
     *      tableFilters → the LocationsOverviewMap widget re-renders with
     *      filtered pins (no "Apply" button needed).
     *
     * The SelectFilter definitions remain on the table for their modifyQueryUsing
     * logic; they're hidden from the table UI via FiltersLayout::Dropdown with
     * the trigger button hidden.
     */
    public function headerWidgets(Schema $schema): Schema
    {
        $statusOptions = [
            '' => 'All statuses',
            Location::STATUS_PENDING => 'Pending',
            Location::STATUS_APPROVED => 'Approved',
            Location::STATUS_REJECTED => 'Rejected',
        ];

        $tierOptions = collect(Location::TIER_DESCRIPTIONS)
            ->keys()
            ->mapWithKeys(fn (int $tier): array => [$tier => "Tier {$tier}"])
            ->all();

        // Current filter values (from URL / Livewire state) for server-side
        // selected-attribute rendering so the dropdowns show the right value on
        // initial page load (URL-persisted filters) and after Livewire morphing.
        $currentStatus = $this->tableFilters['status']['value'] ?? '';
        $currentTier = $this->tableFilters['tier']['value'] ?? '';

        // Build raw <option> HTML for each select, marking the active option.
        $statusHtml = '';
        foreach ($statusOptions as $value => $label) {
            $selected = (string) $value === (string) $currentStatus ? ' selected' : '';
            $statusHtml .= "<option value=\"{$value}\"{$selected}>{$label}</option>";
        }

        $tierHtml = '<option value=""'.($currentTier === '' ? ' selected' : '').'>All tiers</option>';
        foreach ($tierOptions as $value => $label) {
            $selected = (string) $value === (string) $currentTier ? ' selected' : '';
            $tierHtml .= "<option value=\"{$value}\"{$selected}>{$label}</option>";
        }

        // Inline styles reuse Filament's own input-wrapper tokens so the selects
        // look identical to the table's built-in SelectFilter dropdowns.
        $filterBar = <<<HTML
            <div class="fi-ta-filters-above-content-ctn px-4 py-3 sm:px-6 border-b border-gray-200 dark:border-white/10">
                <div class="flex flex-wrap gap-3">
                    <div class="fi-input-wrp flex rounded-lg shadow-sm ring-1 ring-gray-950/10 dark:ring-white/20 min-w-40">
                        <select
                            wire:model.live="tableFilters.status.value"
                            class="fi-select-input block w-full border-none bg-transparent py-1.5 pe-8 ps-3 text-sm text-gray-950 outline-none focus:ring-0 dark:text-white"
                        >
                            {$statusHtml}
                        </select>
                    </div>
                    <div class="fi-input-wrp flex rounded-lg shadow-sm ring-1 ring-gray-950/10 dark:ring-white/20 min-w-40">
                        <select
                            wire:model.live="tableFilters.tier.value"
                            class="fi-select-input block w-full border-none bg-transparent py-1.5 pe-8 ps-3 text-sm text-gray-950 outline-none focus:ring-0 dark:text-white"
                        >
                            {$tierHtml}
                        </select>
                    </div>
                </div>
            </div>
        HTML;

        return $schema->components([
            // Filter bar renders ABOVE the map widget — the layout becomes:
            // page heading → [Status | Tier selects] → map → table.
            Html::make($filterBar),
            Grid::make(1)
                ->schema(fn (): array => $this->cachedHeaderWidgetsSchemaComponents
                    ??= $this->getWidgetsSchemaComponents($this->getHeaderWidgets())),
        ]);
    }

    /**
     * The overview map sits above the table so admins can manage locations
     * visually (spec 06 §5).
     */
    protected function getHeaderWidgets(): array
    {
        return [
            LocationsOverviewMap::class,
        ];
    }

    public function getHeaderWidgetsColumns(): int|array
    {
        return 1;
    }
}
