<?php

namespace App\Filament\Resources\AppUsers\RelationManagers;

use App\Models\AppUnlockedLocation;
use Filament\Actions\DeleteAction;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Lists the spots this AppUser has DISCOVERED (unlocked by reaching them),
 * newest first. A discovery is distinct from a check-in: physically reaching a
 * spot unlocks it (keeps it on the user's map) even with no photo check-in.
 *
 * Admins can REVOKE a discovery — deleting the unlock so the spot un-reveals on
 * the user's next app sync (the app pulls the authoritative unlocked set from
 * /account/me on open). This is the ONLY way to clear a proximity-only unlock
 * (one with no backing check-in, which the check-in "Revoke" cascade can't
 * reach). It also means a returning user / new device restores exactly this set.
 */
class DiscoveriesRelationManager extends RelationManager
{
    protected static string $relationship = 'unlockedLocations';

    protected static ?string $title = 'Discoveries (unlocked spots)';

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('location.name')
                    ->label('Spot')
                    ->weight('bold')
                    // The unlock stores only the slug; show it when the live
                    // location row can't be resolved (e.g. removed since).
                    ->placeholder(fn (AppUnlockedLocation $record): string => $record->location_id)
                    ->description(fn (AppUnlockedLocation $record): string => $record->location_id),
                TextColumn::make('created_at')
                    ->label('Discovered')
                    ->dateTime()
                    ->since()
                    ->sortable(),
            ])
            ->recordActions([
                DeleteAction::make()
                    ->label('Revoke')
                    ->modalHeading('Revoke this discovery?')
                    ->modalDescription('This removes the unlocked spot from the user. It will un-reveal on their next app sync. This cannot be undone.'),
            ]);
    }
}
