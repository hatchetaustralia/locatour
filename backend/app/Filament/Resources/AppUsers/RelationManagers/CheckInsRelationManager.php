<?php

namespace App\Filament\Resources\AppUsers\RelationManagers;

use Filament\Actions\DeleteAction;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Lists a single AppUser's check-ins (newest first) with a photo thumbnail,
 * location, points and timestamp. Admins can REVOKE (delete) a check-in here —
 * the photo is cleaned off the public disk via the model's `deleting` hook.
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
            ])
            ->recordActions([
                DeleteAction::make()
                    ->label('Revoke')
                    ->modalHeading('Revoke this check-in?')
                    ->modalDescription('This permanently removes the check-in and its photo. This cannot be undone.'),
            ]);
    }
}
