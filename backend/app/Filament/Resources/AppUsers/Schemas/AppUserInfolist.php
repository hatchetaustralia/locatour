<?php

namespace App\Filament\Resources\AppUsers\Schemas;

use App\Filament\Resources\AppUsers\Tables\AppUsersTable;
use App\Models\AppUser;
use Filament\Infolists\Components\ImageEntry;
use Filament\Infolists\Components\RepeatableEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class AppUserInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Profile')
                    ->columns(3)
                    ->schema([
                        ImageEntry::make('avatar_url')
                            ->label('Avatar')
                            ->circular()
                            ->defaultImageUrl(fn (): string => 'https://ui-avatars.com/api/?name=?&background=64748b&color=fff'),
                        TextEntry::make('display_name')
                            ->label('Display name')
                            ->weight('bold'),
                        TextEntry::make('username')
                            ->prefix('@')
                            ->placeholder('—'),
                        TextEntry::make('email')->placeholder('—'),
                        TextEntry::make('phone')->placeholder('—'),
                        TextEntry::make('gender')->placeholder('—'),
                        TextEntry::make('home_suburb')
                            ->label('Home suburb')
                            ->placeholder('—'),
                        TextEntry::make('device_id')
                            ->label('Device ID')
                            ->copyable()
                            ->fontFamily('mono'),
                        TextEntry::make('status')
                            ->badge()
                            ->color(fn (string $state): string => match ($state) {
                                AppUser::STATUS_ACTIVE => 'success',
                                AppUser::STATUS_BLOCKED => 'danger',
                                default => 'gray',
                            }),
                        // App-level privilege role (separate from Filament/admin
                        // roles). Labels + colours shared with the table column.
                        TextEntry::make('role')
                            ->badge()
                            ->formatStateUsing(fn (?string $state): string => AppUsersTable::ROLE_LABELS[$state] ?? ucfirst((string) $state))
                            ->color(fn (?string $state): string => AppUsersTable::ROLE_COLORS[$state] ?? 'gray'),
                        TextEntry::make('bio')
                            ->placeholder('—')
                            ->columnSpanFull(),
                        TextEntry::make('interests')
                            ->badge()
                            ->placeholder('—')
                            ->columnSpanFull(),
                    ]),

                Section::make('Stats')
                    ->schema([
                        Grid::make(4)->schema([
                            TextEntry::make('current_level')
                                ->label('Level')
                                ->badge()
                                ->color('info'),
                            TextEntry::make('total_xp')
                                ->label('Total XP')
                                ->numeric(),
                            TextEntry::make('day_streak')
                                ->label('Day streak')
                                ->numeric(),
                            TextEntry::make('checkIns_count')
                                ->label('Check-ins')
                                ->state(fn (AppUser $record): int => $record->checkIns()->count()),
                        ]),
                    ]),

                Section::make('Activity')
                    ->schema([
                        Grid::make(3)->schema([
                            TextEntry::make('last_login_at')
                                ->label('Last login')
                                ->dateTime()
                                ->since()
                                ->placeholder('Never'),
                            TextEntry::make('last_seen_at')
                                ->label('Last seen')
                                ->dateTime()
                                ->since()
                                ->placeholder('Never'),
                            TextEntry::make('login_count')
                                ->label('Logins')
                                ->numeric(),
                        ]),
                    ]),

                // Shown only when the account has at least one unresolved flag.
                // Admins resolve flags via the "Resolve flags" action in the page header.
                Section::make('Flags')
                    ->icon('heroicon-o-flag')
                    ->iconColor('danger')
                    ->description('Unresolved flags raised by automated monitors or admins.')
                    ->schema([
                        RepeatableEntry::make('activeFlags')
                            ->hiddenLabel()
                            ->schema([
                                TextEntry::make('type')
                                    ->label('Type')
                                    ->badge()
                                    ->color('danger'),
                                TextEntry::make('created_at')
                                    ->label('Raised at')
                                    ->dateTime(),
                                TextEntry::make('reason')
                                    ->label('Reason')
                                    ->columnSpanFull(),
                                TextEntry::make('details')
                                    ->label('Details')
                                    ->state(fn ($record): string => $record->details
                                        ? collect($record->details)
                                            ->map(fn ($v, $k) => "$k: $v")
                                            ->implode(', ')
                                        : '—'
                                    )
                                    ->columnSpanFull(),
                            ])
                            ->columns(2),
                    ])
                    ->visible(fn (AppUser $record): bool => $record->isFlagged()),

                // C/D fix: the original 4-column RepeatableEntry with a fixed
                // height(160) image caused horizontal overflow on narrow viewports
                // (the 4 fixed-width columns exceeded the page width, pushing the
                // sticky topbar short of the right edge) and the oversized content
                // area trapped page scroll so nothing below the gallery was
                // reachable.  Fix: drop to 2 columns (naturally wraps on mobile),
                // remove the fixed pixel height so images scale with the column
                // width, and add overflow-x-auto + min-w-0 containment on the
                // repeatable so it can never push the page wider than the viewport.
                Section::make('Check-in photo gallery')
                    ->description('A quick visual scan of everything this user has uploaded (newest first).')
                    ->collapsible()
                    ->schema([
                        RepeatableEntry::make('checkIns')
                            ->hiddenLabel()
                            ->columns(2)
                            ->extraAttributes(['class' => 'min-w-0 overflow-x-auto'])
                            ->schema([
                                ImageEntry::make('photo_url')
                                    ->hiddenLabel()
                                    ->disk('public')
                                    ->extraImgAttributes(['class' => 'object-cover rounded-lg w-full'])
                                    ->defaultImageUrl(fn (): string => 'https://placehold.co/300x200?text=No+photo'),
                                TextEntry::make('location_name')
                                    ->hiddenLabel()
                                    ->size('xs')
                                    ->color('gray')
                                    ->placeholder(fn ($record): string => $record->location_id),
                            ]),
                    ])
                    ->visible(fn (AppUser $record): bool => $record->checkIns()->exists()),
            ]);
    }
}
