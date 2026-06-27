<?php

namespace App\Filament\Resources\AppUsers\Tables;

use App\Models\AppUser;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\ViewAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class AppUsersTable
{
    /**
     * App-level role display labels (keyed by the stored value on app_users.role).
     * Shared by the badge column, the role filter, and the edit-modal select so
     * the four allowed roles stay in lock-step everywhere.
     */
    public const ROLE_LABELS = [
        'player' => 'Player',
        'collaborator' => 'Collaborator',
        'admin' => 'Admin',
        'super_admin' => 'Super admin',
    ];

    /** Badge colours per role, mirroring ROLE_LABELS keys. */
    public const ROLE_COLORS = [
        'player' => 'gray',
        'collaborator' => 'info',
        'admin' => 'warning',
        'super_admin' => 'danger',
    ];

    public static function configure(Table $table): Table
    {
        return $table
            // Activity-first: most-recently-active accounts surface at the top so
            // "who has logged in / used the app lately" is front and centre.
            ->defaultSort('last_seen_at', 'desc')
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
                // App-level privilege role on the mobile-player record. This is
                // separate from the Filament/admin users table & its Spatie roles
                // and does NOT grant panel access — it's the foundation for
                // in-app privileges + admin management.
                TextColumn::make('role')
                    ->badge()
                    ->sortable()
                    ->formatStateUsing(fn (?string $state): string => self::ROLE_LABELS[$state] ?? ucfirst((string) $state))
                    ->color(fn (?string $state): string => self::ROLE_COLORS[$state] ?? 'gray'),
                // Shows a danger flag icon when the account has unresolved flags.
                // Tooltip is omitted here (flag details live on the view page).
                IconColumn::make('is_flagged')
                    ->label('Flagged')
                    ->boolean()
                    ->state(fn (AppUser $record): bool => $record->isFlagged())
                    ->trueIcon('heroicon-o-flag')
                    ->falseIcon('heroicon-o-minus')
                    ->trueColor('danger')
                    ->falseColor('gray')
                    ->toggleable(),
                // Recency-highlighted activity column: green when the user was
                // seen in the last ~24h, gray when stale (>14d), neutral in
                // between. The absolute timestamp lives in the tooltip so the
                // relative "X ago" stays scannable.
                TextColumn::make('last_seen_at')
                    ->label('Last seen')
                    ->since()
                    ->sortable()
                    ->badge()
                    ->placeholder('Never')
                    ->color(fn (AppUser $record): string => match (true) {
                        $record->last_seen_at === null => 'gray',
                        $record->last_seen_at->gt(now()->subDay()) => 'success',
                        $record->last_seen_at->lt(now()->subDays(14)) => 'danger',
                        default => 'warning',
                    })
                    ->tooltip(fn (AppUser $record): ?string => $record->last_seen_at?->toDayDateTimeString()),
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
                SelectFilter::make('role')
                    ->options(self::ROLE_LABELS),
                // Narrows the list to accounts with at least one unresolved flag.
                Filter::make('flagged')
                    ->label('Flagged accounts only')
                    ->query(fn (Builder $query): Builder => $query->flagged())
                    ->toggle(),
            ])
            ->recordActions([
                ViewAction::make(),
                // Inline modal-form edit. The resource has no full form schema
                // (it's a read-only monitoring resource), so username + app role
                // are edited via a lightweight modal rather than an Edit page.
                Action::make('edit')
                    ->label('Edit')
                    ->icon('heroicon-o-pencil-square')
                    ->fillForm(fn (AppUser $record): array => [
                        'username' => $record->username,
                        'role' => $record->role,
                    ])
                    ->form([
                        TextInput::make('username')
                            ->required()
                            ->string()
                            ->minLength(3)
                            ->maxLength(255)
                            // Unique public handle; ignore the current record so a
                            // no-op save doesn't trip the uniqueness rule.
                            ->unique(table: 'app_users', column: 'username', ignoreRecord: true),
                        Select::make('role')
                            ->required()
                            ->options(self::ROLE_LABELS)
                            ->native(false),
                    ])
                    ->action(function (AppUser $record, array $data): void {
                        // role is not mass-assignable on the model; forceFill keeps
                        // this admin-only write working without touching the model.
                        $record->forceFill([
                            'username' => $data['username'],
                            'role' => $data['role'],
                        ])->save();

                        Notification::make()
                            ->title('App user updated')
                            ->success()
                            ->send();
                    }),
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
                // Permanently delete the account (and its cascaded data). Guarded
                // by Filament's confirmation modal.
                DeleteAction::make()
                    ->requiresConfirmation(),
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
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
