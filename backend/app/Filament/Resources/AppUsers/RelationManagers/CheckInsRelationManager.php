<?php

namespace App\Filament\Resources\AppUsers\RelationManagers;

use App\Models\AppCheckIn;
use Filament\Actions\DeleteAction;
use Filament\Actions\ViewAction;
use Filament\Infolists\Components\ImageEntry;
use Filament\Infolists\Components\KeyValueEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Lists a single AppUser's check-ins (newest first) with a photo thumbnail,
 * location, points and timestamp. "View" opens a detail panel with the full
 * verification metadata (coordinates, GPS accuracy, distance from the pin,
 * device vs server time, camera EXIF). Admins can REVOKE (delete) a check-in —
 * the photo is cleaned off the public disk via the model's `deleting` hook.
 */
class CheckInsRelationManager extends RelationManager
{
    protected static string $relationship = 'checkIns';

    protected static ?string $title = 'Check-ins';

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('checked_in_at', 'desc')
            ->columns([
                ImageColumn::make('photo_url')
                    ->label('Photo')
                    ->disk('public')
                    ->square()
                    ->defaultImageUrl(fn (): string => 'https://placehold.co/100x100?text=No+photo'),
                TextColumn::make('location_name')
                    ->label('Location')
                    ->searchable()
                    ->placeholder(fn ($record): string => $record->location_id)
                    ->description(fn ($record): string => $record->location_id),
                TextColumn::make('points_earned')
                    ->label('Points')
                    ->numeric()
                    ->sortable(),
                IconColumn::make('verified_offline')
                    ->label('Offline')
                    ->boolean()
                    ->toggleable(),
                TextColumn::make('checked_in_at')
                    ->label('Checked in')
                    ->dateTime()
                    ->sortable(),
            ])
            ->recordActions([
                ViewAction::make()
                    ->label('View')
                    ->modalHeading('Check-in details')
                    ->schema(fn (Schema $schema): Schema => $this->detailSchema($schema)),
                DeleteAction::make()
                    ->label('Revoke')
                    ->modalHeading('Revoke this check-in?')
                    ->modalDescription('This permanently removes the check-in and its photo. This cannot be undone.'),
            ]);
    }

    /** The read-only verification detail panel shown by the "View" action. */
    protected function detailSchema(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Check-in')
                ->columns(2)
                ->schema([
                    ImageEntry::make('photo_url')
                        ->label('Photo')
                        ->disk('public')
                        ->extraImgAttributes(['class' => 'object-cover rounded-lg max-h-96'])
                        ->defaultImageUrl(fn (): string => 'https://placehold.co/300x200?text=No+photo')
                        ->columnSpanFull(),
                    TextEntry::make('location_name')
                        ->label('Location')
                        ->weight('bold')
                        ->placeholder(fn (AppCheckIn $record): string => $record->location_id)
                        ->helperText(fn (AppCheckIn $record): string => 'slug: '.$record->location_id),
                    TextEntry::make('points_earned')
                        ->label('Points earned')
                        ->badge()
                        ->color('success'),
                    TextEntry::make('verified_offline')
                        ->label('Capture mode')
                        ->badge()
                        ->state(fn (AppCheckIn $record): string => $record->verified_offline ? 'Offline (synced later)' : 'Live (online)')
                        ->color(fn (AppCheckIn $record): string => $record->verified_offline ? 'warning' : 'success')
                        ->helperText(fn (AppCheckIn $record): ?string => $record->verified_offline
                            ? 'The phone had no network at check-in; the record was saved on-device and uploaded afterwards, so the server did not see it in real time.'
                            : null),
                    TextEntry::make('id')
                        ->label('Check-in ID')
                        ->copyable()
                        ->fontFamily('mono'),
                ]),

            Section::make('Verification')
                ->description('Where and when the device says this happened.')
                ->schema([
                    Grid::make(2)->schema([
                        TextEntry::make('coordinates')
                            ->label('Device coordinates')
                            ->state(fn (AppCheckIn $record): ?string => $record->latitude !== null && $record->longitude !== null
                                ? number_format((float) $record->latitude, 6).', '.number_format((float) $record->longitude, 6)
                                : null)
                            ->placeholder('Not recorded')
                            ->url(fn (AppCheckIn $record): ?string => $record->latitude !== null && $record->longitude !== null
                                ? 'https://www.google.com/maps/search/?api=1&query='.$record->latitude.','.$record->longitude
                                : null, shouldOpenInNewTab: true)
                            ->icon('heroicon-o-map-pin')
                            ->color(fn (AppCheckIn $record): string => $record->latitude !== null ? 'primary' : 'gray'),
                        TextEntry::make('gps_accuracy')
                            ->label('GPS accuracy')
                            ->state(fn (AppCheckIn $record): ?string => $record->gps_accuracy !== null
                                ? '± '.number_format((float) $record->gps_accuracy, 1).' m'
                                : null)
                            ->placeholder('Unknown'),
                        TextEntry::make('distance_meters')
                            ->label('Distance from the pin')
                            ->state(fn (AppCheckIn $record): ?string => $record->distance_meters !== null
                                ? number_format($record->distance_meters).' m from the location'
                                : null)
                            ->placeholder('Cannot compute (missing coords / location removed)')
                            ->badge()
                            ->color(fn (AppCheckIn $record): string => match (true) {
                                $record->distance_meters === null => 'gray',
                                $record->distance_meters <= 150 => 'success',
                                $record->distance_meters <= 500 => 'warning',
                                default => 'danger',
                            }),
                        TextEntry::make('checked_in_at')
                            ->label('Device time (reported)')
                            ->dateTime()
                            ->placeholder('—'),
                        TextEntry::make('created_at')
                            ->label('Received by server')
                            ->dateTime()
                            ->since()
                            ->helperText('A large gap from the device time can indicate a delayed/offline upload.'),
                    ]),
                ]),

            Section::make('Camera metadata (EXIF)')
                ->description('Raw tags the camera embedded in the photo. Shape varies by device.')
                ->collapsible()
                ->collapsed()
                ->schema([
                    KeyValueEntry::make('photo_exif')
                        ->hiddenLabel()
                        ->keyLabel('Tag')
                        ->valueLabel('Value')
                        // EXIF can hold nested objects (e.g. a GPS sub-dict); KeyValueEntry
                        // only renders scalars, so JSON-encode anything that isn't one.
                        ->state(fn (AppCheckIn $record): array => collect($record->photo_exif ?? [])
                            ->map(fn ($v) => is_scalar($v) ? $v : json_encode($v))
                            ->all()),
                ])
                ->visible(fn (AppCheckIn $record): bool => ! empty($record->photo_exif)),

            Section::make('Sharing')
                ->schema([
                    TextEntry::make('share_url')
                        ->label('Public share link')
                        ->placeholder('Not shared')
                        ->copyable()
                        ->url(fn (AppCheckIn $record): ?string => $record->share_url, shouldOpenInNewTab: true),
                ])
                ->visible(fn (AppCheckIn $record): bool => (bool) $record->share_token),
        ]);
    }
}
