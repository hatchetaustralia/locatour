<?php

namespace App\Filament\Resources\Achievements\Schemas;

use App\Models\Achievement;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Illuminate\Support\Str;

class AchievementForm
{
    public static function configure(Schema $schema): Schema
    {
        $difficulties = array_combine(array_keys(Achievement::DIFFICULTIES), array_keys(Achievement::DIFFICULTIES));

        return $schema
            ->components([
                Section::make('Achievement')
                    ->columns(2)
                    ->schema([
                        TextInput::make('title')
                            ->required()
                            ->live(onBlur: true)
                            // Derive the key from the title on create; keep it stable on edit.
                            ->afterStateUpdated(fn ($state, Set $set, ?Achievement $record) => $record ? null : $set('key', Str::slug((string) $state)))
                            ->columnSpanFull(),
                        Textarea::make('description')
                            ->required()
                            ->rows(2)
                            ->columnSpanFull(),
                        Select::make('difficulty')
                            ->options($difficulties)
                            ->required()
                            ->live()
                            ->afterStateUpdated(fn ($state, Set $set) => $set('points', Achievement::DIFFICULTIES[$state] ?? 50))
                            ->helperText('Sets the default point reward.'),
                        TextInput::make('points')
                            ->label('Points (XP)')
                            ->numeric()
                            ->required()
                            ->minValue(0)
                            ->helperText('Defaults from difficulty; override if needed.'),
                        TextInput::make('category')
                            ->helperText('Flavour grouping (Exploration, Streaks, …).'),
                        TextInput::make('icon_name')
                            ->label('Icon (Ionicons)')
                            ->required()
                            ->default('trophy-outline')
                            ->helperText('e.g. trophy-outline, flame-outline, leaf-outline.'),
                    ]),

                Section::make('Completion rule')
                    ->description('Awarded automatically when the player\'s metric reaches the threshold.')
                    ->columns(2)
                    ->schema([
                        Select::make('metric')
                            ->label('Metric')
                            ->options(Achievement::METRICS)
                            ->required()
                            ->searchable()
                            ->helperText('What the player must accumulate.'),
                        TextInput::make('threshold')
                            ->numeric()
                            ->required()
                            ->minValue(1)
                            ->helperText('Awarded when the metric reaches this value.'),
                    ]),

                Section::make('Advanced')
                    ->columns(2)
                    ->collapsed()
                    ->schema([
                        TextInput::make('key')
                            ->required()
                            ->unique(ignoreRecord: true)
                            ->helperText('Stable id used by the app.'),
                        TextInput::make('sort')
                            ->numeric()
                            ->default(0),
                        Toggle::make('is_active')
                            ->default(true)
                            ->helperText('Inactive achievements are hidden from the app.'),
                    ]),
            ]);
    }
}
