<?php

namespace App\Filament\Resources\Locations\Tables;

use App\Models\Location;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Actions\ViewAction;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class LocationsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('category')
                    ->badge()
                    ->sortable(),
                TextColumn::make('status')
                    ->badge()
                    ->sortable()
                    ->color(fn (string $state): string => match ($state) {
                        Location::STATUS_APPROVED => 'success',
                        Location::STATUS_PENDING => 'warning',
                        Location::STATUS_REJECTED => 'danger',
                        default => 'gray',
                    }),
                TextColumn::make('submittedBy.name')
                    ->label('Submitted by')
                    ->placeholder('Seed / admin')
                    ->toggleable(),
                TextColumn::make('tier')
                    ->label('Rarity')
                    ->badge()
                    ->formatStateUsing(fn ($state): string => Location::rarityForTier((int) $state))
                    ->sortable(),
                TextColumn::make('points')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('check_ins_count')
                    ->label('Check-ins')
                    ->counts('checkIns')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('geofence_radius_m')
                    ->label('Radius (m)')
                    ->numeric()
                    ->toggleable(isToggledHiddenByDefault: true),
                ToggleColumn::make('active'),
            ])
            // The status + tier SelectFilters provide the modifyQueryUsing logic
            // that actually scopes the query when tableFilters is set.  The UI for
            // these filters is rendered above the map via the page-level select bar
            // on ListLocations::headerWidgets() — NOT inside the table — so the
            // layout is: page heading → filters → map → table rows.
            // FiltersLayout default (Dropdown) keeps the filter trigger hidden; the
            // page-level wire:model.live selects drive tableFilters directly.
            ->filters([
                SelectFilter::make('status')
                    ->options([
                        Location::STATUS_PENDING => 'Pending',
                        Location::STATUS_APPROVED => 'Approved',
                        Location::STATUS_REJECTED => 'Rejected',
                    ]),
                SelectFilter::make('tier')
                    ->options(
                        collect(Location::TIER_DESCRIPTIONS)
                            ->keys()
                            ->mapWithKeys(fn (int $tier): array => [$tier => Location::rarityForTier($tier)])
                            ->all(),
                    ),
            ])
            ->recordActions([
                // Moderators/admins approve a pending submission.
                Action::make('approve')
                    ->icon('heroicon-o-check-circle')
                    ->color('success')
                    ->requiresConfirmation()
                    ->visible(fn (Location $record): bool => $record->status === Location::STATUS_PENDING)
                    ->authorize(fn (Location $record): bool => auth()->user()?->can('approve', $record) ?? false)
                    ->action(function (Location $record): void {
                        $record->update(['status' => Location::STATUS_APPROVED]);
                        Notification::make()->title('Location approved')->success()->send();
                    }),
                // Moderators/admins reject a pending submission.
                Action::make('reject')
                    ->icon('heroicon-o-x-circle')
                    ->color('danger')
                    ->requiresConfirmation()
                    ->visible(fn (Location $record): bool => $record->status === Location::STATUS_PENDING)
                    ->authorize(fn (Location $record): bool => auth()->user()?->can('approve', $record) ?? false)
                    ->action(function (Location $record): void {
                        $record->update(['status' => Location::STATUS_REJECTED]);
                        Notification::make()->title('Location rejected')->danger()->send();
                    }),
                ViewAction::make(),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ])
            // Disable the default right-side global search bar. A custom search
            // field is injected at TOOLBAR_START (left side) via the
            // AdminPanelProvider render hook so the toolbar reads:
            //   [search]  ←left          right→  [column toggle]
            ->searchable(false);
    }
}
