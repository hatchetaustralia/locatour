<?php

namespace App\Filament\Resources\Announcements\Schemas;

use App\Models\Announcement;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class AnnouncementForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('title')
                    ->required()
                    ->maxLength(120)
                    ->columnSpanFull(),
                Textarea::make('body')
                    ->label('Message')
                    ->required()
                    ->rows(4)
                    ->columnSpanFull(),
                Select::make('level')
                    ->label('Style')
                    ->options(Announcement::LEVELS)
                    ->default(Announcement::LEVEL_INFO)
                    ->required()
                    ->native(false),
                Toggle::make('is_active')
                    ->label('Live now')
                    ->helperText('Only one announcement is live at a time — turning this on replaces the current live one.')
                    ->inline(false),
                DateTimePicker::make('starts_at')
                    ->label('Starts')
                    ->helperText('Optional — leave blank to show as soon as it goes live.')
                    ->seconds(false),
                DateTimePicker::make('ends_at')
                    ->label('Ends')
                    ->helperText('Optional — leave blank to show until you switch it off.')
                    ->seconds(false)
                    ->after('starts_at'),
            ]);
    }
}
