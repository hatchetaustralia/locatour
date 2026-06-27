<?php

namespace App\Filament\Resources\AppUsers\Pages;

use App\Filament\Resources\AppUsers\AppUserResource;
use App\Filament\Resources\AppUsers\Widgets\SignupsCheckinsChart;
use Filament\Resources\Pages\ListRecords;

class ListAppUsers extends ListRecords
{
    protected static string $resource = AppUserResource::class;

    // No CreateAction: app users are provisioned by the register API, not here.
    protected function getHeaderActions(): array
    {
        return [];
    }

    // Sign-ups vs check-ins trend chart, rendered above the table.
    protected function getHeaderWidgets(): array
    {
        return [
            SignupsCheckinsChart::class,
        ];
    }

    // Single full-width column so the chart spans the page above the table.
    public function getHeaderWidgetsColumns(): int|array
    {
        return 1;
    }
}
