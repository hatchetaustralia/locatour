<?php

namespace App\Filament\Resources\Locations\Tables;

use App\Models\Location;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
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
                    ->label('Tier')
                    ->badge()
                    ->sortable(),
                TextColumn::make('points')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('geofence_radius_m')
                    ->label('Radius (m)')
                    ->numeric()
                    ->toggleable(isToggledHiddenByDefault: true),
                ToggleColumn::make('active'),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->options([
                        Location::STATUS_PENDING => 'Pending',
                        Location::STATUS_APPROVED => 'Approved',
                        Location::STATUS_REJECTED => 'Rejected',
                    ]),
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
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
