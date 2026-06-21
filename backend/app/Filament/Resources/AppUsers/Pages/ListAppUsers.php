<?php

namespace App\Filament\Resources\AppUsers\Pages;

use App\Filament\Resources\AppUsers\AppUserResource;
use Filament\Resources\Pages\ListRecords;

class ListAppUsers extends ListRecords
{
    protected static string $resource = AppUserResource::class;

    // No CreateAction: app users are provisioned by the register API, not here.
    protected function getHeaderActions(): array
    {
        return [];
    }
}
