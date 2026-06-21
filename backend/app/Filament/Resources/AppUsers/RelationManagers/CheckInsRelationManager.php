<?php

namespace App\Filament\Resources\AppUsers\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Lists a single AppUser's check-ins (newest first) with a photo thumbnail,
 * location, points and timestamp. Read-only — admins inspect, they do not edit
 * a user's check-ins from here.
 */
class CheckInsRelationManager extends RelationManager
{
    protected static string $relationship = 'checkIns';

    protected static ?string $title = 'Check-ins';

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('checked_in_at', 'desc')
            ->columns([
                ImageColumn::make('photo_url')
                    ->label('Photo')
                    ->disk('public')
                    ->square()
                    ->defaultImageUrl(fn (): string => 'https://placehold.co/100x100?text=No+photo'),
                TextColumn::make('location_name')
                    ->label('Location')
                    ->searchable()
                    ->placeholder(fn ($record): string => $record->location_id)
                    ->description(fn ($record): string => $record->location_id),
                TextColumn::make('points_earned')
                    ->label('Points')
                    ->numeric()
                    ->sortable(),
                IconColumn::make('verified_offline')
                    ->label('Offline')
                    ->boolean()
                    ->toggleable(),
                TextColumn::make('checked_in_at')
                    ->label('Checked in')
                    ->dateTime()
                    ->sortable(),
            ]);
    }
}
