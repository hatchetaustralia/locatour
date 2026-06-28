<?php

namespace App\Filament\Resources\LocationSuggestions\Tables;

use App\Filament\Resources\Locations\LocationResource;
use App\Models\LocationSuggestion;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class LocationSuggestionsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            // Decorate the base query with a per-row "times suggested" aggregate.
            // There is no shared google place_id on a suggestion, so the dedupe key
            // is a normalised name + proximity: same case/whitespace-insensitive name
            // AND coordinates inside a small bounding box (~0.001° ≈ 110 m). One
            // correlated subquery per list query keeps this N+1-free.
            ->modifyQueryUsing(fn (Builder $query): Builder => $query
                ->select('location_suggestions.*')
                ->selectRaw(
                    '(SELECT COUNT(*) FROM location_suggestions AS dup'
                    ." WHERE LOWER(TRIM(COALESCE(dup.name, ''))) = LOWER(TRIM(COALESCE(location_suggestions.name, '')))"
                    .' AND ABS(dup.latitude - location_suggestions.latitude) < 0.001'
                    .' AND ABS(dup.longitude - location_suggestions.longitude) < 0.001'
                    .') AS times_suggested_count'
                ))
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

                // How many suggestions (including this one) point at the same place,
                // matched by normalised name + proximity (see modifyQueryUsing above).
                TextColumn::make('times_suggested_count')
                    ->label('Times suggested')
                    ->badge()
                    ->color('gray')
                    ->sortable()
                    ->alignCenter(),

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
                // Approve → open the FULL Location create form, prefilled from this
                // suggestion (CreateLocation reads ?suggestion=). We deliberately do
                // NOT mutate the suggestion here; the suggestion is marked approved /
                // linked (converted_location_id) by the create flow once the admin
                // actually saves the location.
                Action::make('approve')
                    ->label('Approve')
                    ->icon('heroicon-o-check-circle')
                    ->color('success')
                    ->visible(fn (LocationSuggestion $record): bool => $record->status === LocationSuggestion::STATUS_PENDING)
                    ->url(fn (LocationSuggestion $record): string => LocationResource::getUrl('create', ['suggestion' => $record->id])),

                EditAction::make(),
            ]);
    }
}
