<?php

namespace Tests\Feature;

use App\Filament\Resources\Locations\Pages\ListLocations;
use App\Filament\Resources\Locations\Widgets\LocationsOverviewMap;
use App\Models\Location;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression test for the /admin/locations 500 on filter apply:
 *
 *   TypeError: Cannot assign null to property LocationsOverviewMap::
 *   $tableColumnSearches of type array
 *
 * The LocationsOverviewMap header widget uses InteractsWithPageTable, which
 * declares non-nullable #[Reactive] table-state props (e.g. array
 * $tableColumnSearches). On each Livewire round-trip the parent ListLocations
 * page must supply those values via getWidgetData(). Before the fix the page
 * did not use the ExposesTableToWidgets trait, so getWidgetData() returned []
 * and Livewire hydrated the reactive props with null -> TypeError.
 *
 * These tests assert getWidgetData() now supplies a real array for every
 * reactive prop (with the active filter state), and that the widget reduces its
 * map pins in lock-step with that filter.
 */
class LocationsOverviewMapFilterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAs(User::factory()->create());

        // Boot the admin panel so the page's table can resolve.
        Filament::setCurrentPanel(Filament::getPanel('admin'));
        Filament::bootCurrentPanel();

        Location::create([
            'slug' => 'approved-one', 'name' => 'Approved One', 'category' => 'park',
            'address' => '1 Approved St', 'latitude' => -33.8, 'longitude' => 151.2,
            'points' => 10, 'tier' => 1,
            'geofence_radius_m' => 100, 'active' => true, 'status' => Location::STATUS_APPROVED,
        ]);
        Location::create([
            'slug' => 'pending-one', 'name' => 'Pending One', 'category' => 'park',
            'address' => '2 Pending Rd', 'latitude' => -33.9, 'longitude' => 151.3,
            'points' => 5, 'tier' => 2,
            'geofence_radius_m' => 100, 'active' => true, 'status' => Location::STATUS_PENDING,
        ]);
    }

    /**
     * Boot a ListLocations page instance with table state the way the Livewire
     * round-trip carries it (without mount(), which performs panel access checks
     * that require the full HTTP/Shield context).
     */
    private function bootedPageWithStatusFilter(string $status): ListLocations
    {
        $page = app('livewire')->new(ListLocations::class);
        $page->tableFilters = ['status' => ['value' => $status]];
        $page->bootedInteractsWithTable();

        return $page;
    }

    public function test_get_widget_data_supplies_non_null_arrays_for_reactive_props(): void
    {
        $data = $this->bootedPageWithStatusFilter(Location::STATUS_APPROVED)->getWidgetData();

        // The exact prop from the TypeError must be present and a real array.
        $this->assertArrayHasKey('tableColumnSearches', $data);
        $this->assertIsArray($data['tableColumnSearches']);

        // The filter state must flow through so the widget can mirror it.
        $this->assertSame(
            ['status' => ['value' => Location::STATUS_APPROVED]],
            $data['tableFilters'],
        );
    }

    public function test_widget_accepts_the_parent_payload_without_a_type_error(): void
    {
        $data = $this->bootedPageWithStatusFilter(Location::STATUS_APPROVED)->getWidgetData();

        // This is the assignment Livewire performs when hydrating the reactive
        // prop from the parent payload — it threw the TypeError before the fix.
        $widget = new LocationsOverviewMap;
        $widget->tableColumnSearches = $data['tableColumnSearches'];

        $this->assertIsArray($widget->tableColumnSearches);
    }

    public function test_status_filter_reduces_both_the_table_query_and_the_map_pins(): void
    {
        $page = $this->bootedPageWithStatusFilter(Location::STATUS_APPROVED);

        // Table side: query reduces to the approved row only.
        $this->assertSame(1, $page->getFilteredTableQuery()->count());

        // Map side: a widget driven by the same filtered page reduces its pins
        // to match the table (it must NOT ignore the filter). We feed it the
        // already-booted page instance the trait would otherwise re-mount, so
        // getPins() runs the page's filtered query in this non-HTTP context.
        $widget = new LocationsOverviewMap;
        $widget->tableFilters = $page->getWidgetData()['tableFilters'];

        $tablePage = new \ReflectionProperty(LocationsOverviewMap::class, 'tablePage');
        $tablePage->setValue($widget, $page);

        $pins = $widget->getPins();
        $this->assertCount(1, $pins);
        $this->assertSame(Location::STATUS_APPROVED, $pins[0]['status']);
    }
}
