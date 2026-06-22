<?php

namespace App\Filament\Resources\LocationSuggestions\Schemas;

use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class LocationSuggestionForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('name')
                ->label('Name')
                ->nullable()
                ->maxLength(255),

            TextInput::make('latitude')
                ->label('Latitude')
                ->numeric()
                ->readOnly(),

            TextInput::make('longitude')
                ->label('Longitude')
                ->numeric()
                ->readOnly(),

            Textarea::make('notes')
                ->label('Submitter notes')
                ->nullable()
                ->rows(3),

            Placeholder::make('submitter')
                ->label('Submitted by')
                ->content(fn ($record) => $record?->appUser?->display_name ?? '—'),

            Textarea::make('review_notes')
                ->label('Review notes')
                ->nullable()
                ->rows(3),
        ]);
    }
}
