<?php

namespace App\Filament\Resources\Locations\RelationManagers;

use App\Models\AppCheckIn;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Lists the APP USERS who have checked in at this location, one row per user,
 * sorted by their most recent check-in here (newest first). Read-only.
 *
 * The base `checkIns` relation already scopes to this location (joined on
 * slug — see Location::checkIns()); we aggregate it per user so each row shows
 * the user, their latest check-in date here, and how many times they've
 * checked in here. MIN(id) is selected as the row key so Filament still has a
 * stable record identifier after the GROUP BY.
 */
class CheckInsRelationManager extends RelationManager
{
    protected static string $relationship = 'checkIns';

    protected static ?string $title = 'Visitors (app users who checked in)';

    public function table(Table $table): Table
    {
        return $table
            ->heading('Visitors')
            ->description('App users who have checked in here, most recent first.')
            ->modifyQueryUsing(fn (Builder $query): Builder => $query
                ->selectRaw('MIN(app_check_ins.id) as id, app_check_ins.app_user_id, MAX(app_check_ins.checked_in_at) as last_check_in_at, COUNT(*) as check_in_count')
                ->groupBy('app_check_ins.app_user_id')
                ->with('appUser'))
            ->defaultSort('last_check_in_at', 'desc')
            ->columns([
                ImageColumn::make('appUser.avatar_url')
                    ->label('')
                    ->circular()
                    ->defaultImageUrl(fn (): string => 'https://ui-avatars.com/api/?name=?&background=64748b&color=fff'),
                TextColumn::make('appUser.display_name')
                    ->label('User')
                    ->weight('bold')
                    ->placeholder('Unknown user')
                    ->description(fn (AppCheckIn $record): ?string => $record->appUser?->username
                        ? '@'.$record->appUser->username
                        : null),
                TextColumn::make('last_check_in_at')
                    ->label('Last check-in here')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('check_in_count')
                    ->label('Check-ins here')
                    ->badge()
                    ->color('info')
                    ->sortable(),
            ]);
    }
}
