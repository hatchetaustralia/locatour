<?php

namespace App\Filament\Resources\LocationSuggestions\Pages;

use App\Filament\Resources\LocationSuggestions\LocationSuggestionResource;
use Filament\Resources\Pages\ListRecords;

class ListLocationSuggestions extends ListRecords
{
    protected static string $resource = LocationSuggestionResource::class;
}
