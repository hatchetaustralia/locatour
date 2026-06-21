<?php

namespace App\Filament\Resources\AppUsers\Tables;

use App\Models\AppUser;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\ViewAction;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Collection;

class AppUsersTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                ImageColumn::make('avatar_url')
                    ->label('Avatar')
                    ->circular()
                    ->defaultImageUrl(fn (): string => 'https://ui-avatars.com/api/?name=?&background=64748b&color=fff'),
                TextColumn::make('display_name')
                    ->label('Name')
                    ->searchable()
                    ->sortable()
                    ->weight('bold')
                    ->description(fn (AppUser $record): ?string => $record->username ? '@'.$record->username : null),
                TextColumn::make('email')
                    ->searchable()
                    ->toggleable()
                    ->placeholder('—')
                    ->description(fn (AppUser $record): ?string => $record->phone),
                TextColumn::make('current_level')
                    ->label('Lvl')
                    ->numeric()
                    ->sortable()
                    ->badge()
                    ->color('info'),
                TextColumn::make('total_xp')
                    ->label('XP')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('check_ins_count')
                    ->label('Check-ins')
                    ->counts('checkIns')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('status')
                    ->badge()
                    ->sortable()
                    ->color(fn (string $state): string => match ($state) {
                        AppUser::STATUS_ACTIVE => 'success',
                        AppUser::STATUS_BLOCKED => 'danger',
                        default => 'gray',
                    }),
                TextColumn::make('created_at')
                    ->label('Joined')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->options([
                        AppUser::STATUS_ACTIVE => 'Active',
                        AppUser::STATUS_BLOCKED => 'Blocked',
                    ]),
            ])
            ->recordActions([
                ViewAction::make(),
                // Toggle a single account between active and blocked.
                Action::make('toggleBlock')
                    ->label(fn (AppUser $record): string => $record->isBlocked() ? 'Unblock' : 'Block')
                    ->icon(fn (AppUser $record): string => $record->isBlocked() ? 'heroicon-o-lock-open' : 'heroicon-o-no-symbol')
                    ->color(fn (AppUser $record): string => $record->isBlocked() ? 'success' : 'danger')
                    ->requiresConfirmation()
                    ->modalDescription(fn (AppUser $record): string => $record->isBlocked()
                        ? 'Restore this account? The user will be able to sync and check in again.'
                        : 'Block this account? The user will be refused on every authenticated API call.')
                    ->action(function (AppUser $record): void {
                        $record->update([
                            'status' => $record->isBlocked()
                                ? AppUser::STATUS_ACTIVE
                                : AppUser::STATUS_BLOCKED,
                        ]);

                        Notification::make()
                            ->title($record->isBlocked() ? 'Account blocked' : 'Account unblocked')
                            ->color($record->isBlocked() ? 'danger' : 'success')
                            ->success()
                            ->send();
                    }),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    BulkAction::make('block')
                        ->label('Block selected')
                        ->icon('heroicon-o-no-symbol')
                        ->color('danger')
                        ->requiresConfirmation()
                        ->action(fn (Collection $records) => $records->each->update(['status' => AppUser::STATUS_BLOCKED]))
                        ->deselectRecordsAfterCompletion(),
                    BulkAction::make('unblock')
                        ->label('Unblock selected')
                        ->icon('heroicon-o-lock-open')
                        ->color('success')
                        ->requiresConfirmation()
                        ->action(fn (Collection $records) => $records->each->update(['status' => AppUser::STATUS_ACTIVE]))
                        ->deselectRecordsAfterCompletion(),
                ]),
            ]);
    }
}
