<?php

namespace App\Filament\Resources\Announcements\Tables;

use App\Models\Announcement;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AnnouncementsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('title')
                    ->searchable()
                    ->limit(48)
                    ->weight('bold'),
                TextColumn::make('level')
                    ->label('Style')
                    ->badge()
                    ->formatStateUsing(fn (string $state): string => Announcement::LEVELS[$state] ?? ucfirst($state))
                    ->color(fn (string $state): string => match ($state) {
                        Announcement::LEVEL_SUCCESS => 'success',
                        Announcement::LEVEL_WARNING => 'warning',
                        default => 'info',
                    }),
                IconColumn::make('is_active')
                    ->label('Live')
                    ->boolean()
                    ->sortable(),
                TextColumn::make('starts_at')
                    ->label('Starts')
                    ->dateTime('d M Y, H:i')
                    ->placeholder('Immediately')
                    ->toggleable(),
                TextColumn::make('ends_at')
                    ->label('Ends')
                    ->dateTime('d M Y, H:i')
                    ->placeholder('Until switched off')
                    ->toggleable(),
                TextColumn::make('updated_at')
                    ->label('Updated')
                    ->since()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            // Live one first, then most-recently edited.
            ->defaultSort('is_active', 'desc')
            ->recordActions([
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
