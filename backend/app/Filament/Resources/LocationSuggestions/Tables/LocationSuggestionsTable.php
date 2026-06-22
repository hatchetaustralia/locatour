<?php

namespace App\Filament\Resources\LocationSuggestions\Tables;

use App\Models\LocationSuggestion;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class LocationSuggestionsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            // Pending suggestions first so the review queue is always at the top.
            ->defaultSort(function ($query) {
                $query->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
                    ->orderBy('created_at', 'desc');
            })
            ->columns([
                TextColumn::make('name')
                    ->label('Name')
                    ->placeholder('(unnamed)')
                    ->searchable()
                    ->sortable(),

                TextColumn::make('appUser.display_name')
                    ->label('Submitted by')
                    ->searchable()
                    ->placeholder('—'),

                TextColumn::make('latitude')
                    ->label('Lat')
                    ->numeric(decimalPlaces: 5),

                TextColumn::make('longitude')
                    ->label('Lng')
                    ->numeric(decimalPlaces: 5),

                TextColumn::make('status')
                    ->badge()
                    ->sortable()
                    ->color(fn (string $state): string => match ($state) {
                        LocationSuggestion::STATUS_PENDING => 'warning',
                        LocationSuggestion::STATUS_APPROVED => 'success',
                        LocationSuggestion::STATUS_REJECTED => 'danger',
                        default => 'gray',
                    }),

                TextColumn::make('created_at')
                    ->label('Submitted')
                    ->dateTime()
                    ->sortable(),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->options([
                        LocationSuggestion::STATUS_PENDING => 'Pending',
                        LocationSuggestion::STATUS_APPROVED => 'Approved',
                        LocationSuggestion::STATUS_REJECTED => 'Rejected',
                    ]),
            ])
            ->recordActions([
                EditAction::make(),
            ]);
    }
}
