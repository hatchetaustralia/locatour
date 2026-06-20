<?php

namespace App\Filament\Resources\Achievements\Tables;

use App\Models\Achievement;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class AchievementsTable
{
    public static function configure(Table $table): Table
    {
        $difficulties = array_combine(array_keys(Achievement::DIFFICULTIES), array_keys(Achievement::DIFFICULTIES));

        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('title')
                    ->searchable()
                    ->sortable()
                    ->weight('bold')
                    ->description(fn (Achievement $record): string => $record->description)
                    ->wrap(),
                TextColumn::make('difficulty')
                    ->badge()
                    ->sortable()
                    ->color(fn (string $state): string => match ($state) {
                        'Easy' => 'gray',
                        'Medium' => 'success',
                        'Hard' => 'warning',
                        'Elite' => 'danger',
                        'Master' => 'info',
                        'Grandmaster' => 'primary',
                        default => 'gray',
                    }),
                TextColumn::make('metric')
                    ->badge()
                    ->color('gray')
                    ->formatStateUsing(fn (string $state): string => Achievement::METRICS[$state] ?? $state)
                    ->description(fn (Achievement $record): string => '≥ '.number_format($record->threshold)),
                TextColumn::make('points')
                    ->label('XP')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('category')
                    ->toggleable(),
                IconColumn::make('is_active')
                    ->label('Active')
                    ->boolean(),
            ])
            ->filters([
                SelectFilter::make('difficulty')
                    ->options($difficulties),
                SelectFilter::make('metric')
                    ->options(Achievement::METRICS),
            ])
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
