<?php

namespace App\Filament\Resources\LocationSuggestions;

use App\Filament\Resources\LocationSuggestions\Pages\EditLocationSuggestion;
use App\Filament\Resources\LocationSuggestions\Pages\ListLocationSuggestions;
use App\Filament\Resources\LocationSuggestions\Schemas\LocationSuggestionForm;
use App\Filament\Resources\LocationSuggestions\Tables\LocationSuggestionsTable;
use App\Models\LocationSuggestion;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Table;

/**
 * Filament admin resource for community location suggestions submitted by
 * app users. Admins can reject suggestions (with review notes) or approve
 * them — approval creates a real Location and links it back via
 * converted_location_id.
 */
class LocationSuggestionResource extends Resource
{
    protected static ?string $model = LocationSuggestion::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-inbox-stack';

    protected static string|\UnitEnum|null $navigationGroup = 'Contributions';

    protected static ?string $navigationLabel = 'Location Suggestions';

    protected static ?string $modelLabel = 'Location Suggestion';

    protected static ?string $pluralModelLabel = 'Location Suggestions';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return LocationSuggestionForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return LocationSuggestionsTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListLocationSuggestions::route('/'),
            'edit' => EditLocationSuggestion::route('/{record}/edit'),
        ];
    }
}
