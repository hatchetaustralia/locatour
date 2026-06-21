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

        // Only offer tiers that actually have locations, so the filter never
        // shows an option (e.g. Tier 7–10) that would empty the map/table and
        // look broken. Tiers 1–6 are what the WA seed data currently produces.
        $tierOptions = Location::query()
            ->select('tier')
            ->distinct()
            ->orderBy('tier')
            ->pluck('tier')
            ->mapWithKeys(fn (int $tier): array => [$tier => Location::rarityForTier($tier)])
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

        $tierHtml = '<option value=""'.($currentTier === '' ? ' selected' : '').'>All rarities</option>';
        foreach ($tierOptions as $value => $label) {
            $selected = (string) $value === (string) $currentTier ? ' selected' : '';
            $tierHtml .= "<option value=\"{$value}\"{$selected}>{$label}</option>";
        }

        // The layout is built with INLINE styles, not Tailwind utility classes.
        // This raw HTML lives in a PHP file that the admin theme's CSS build does
        // not scan, so utilities like `flex`/`gap-3`/`min-w-40` are never compiled
        // and the selects would fall back to block-stacking (the bug being fixed
        // here). Inline styles always apply. `fi-input-wrp`/`fi-select-input` are
        // Filament's own component classes (always present in the theme) so each
        // box still matches the native SelectFilter dropdowns.
        // A native <select> with appearance:none (inherited from fi-select-input)
        // has no dropdown arrow, so it reads as a plain text box. Draw a chevron as
        // a right-aligned background SVG and reserve room for it with extra right
        // padding. Built via rawurlencode so the data URI needs no quote juggling
        // inside the HTML style attribute.
        $chevron = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#6b7280"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>';
        $chevronUri = 'data:image/svg+xml,'.rawurlencode($chevron);
        $selectStyle = "width:100%;border:none;background-color:transparent;background-image:url('{$chevronUri}');background-repeat:no-repeat;background-position:right 0.6rem center;background-size:1.1rem;padding:0.5rem 2.25rem 0.5rem 0.75rem;font-size:0.875rem;color:inherit;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none";
        $boxStyle = 'display:flex;flex:0 1 14rem;min-width:11rem;border-radius:0.5rem';

        $filterBar = <<<HTML
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.75rem;padding:0 0 0.25rem">
                <div class="fi-input-wrp" style="{$boxStyle}">
                    <select wire:model.live="tableFilters.status.value" class="fi-select-input" style="{$selectStyle}">
                        {$statusHtml}
                    </select>
                </div>
                <div class="fi-input-wrp" style="{$boxStyle}">
                    <select wire:model.live="tableFilters.tier.value" class="fi-select-input" style="{$selectStyle}">
                        {$tierHtml}
                    </select>
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
