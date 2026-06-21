<?php

namespace App\Filament\Resources\Locations\Schemas;

use App\Models\Location;
use Filament\Infolists\Components\ImageEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Read-only overview of a location for the View page — the core details an
 * admin needs to judge accuracy and scoring at a glance. The full editable
 * field set lives on the Edit page (LocationForm); the user check-in list is
 * appended below this by the CheckInsRelationManager.
 */
class LocationInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Overview')
                    ->columns(3)
                    ->schema([
                        TextEntry::make('name')
                            ->weight('bold')
                            ->columnSpanFull(),
                        TextEntry::make('category')
                            ->badge(),
                        TextEntry::make('tier')
                            ->label('Tier')
                            ->badge()
                            ->formatStateUsing(fn (int $state): string => 'T'.$state)
                            ->color('info'),
                        TextEntry::make('points')
                            ->numeric(),
                        TextEntry::make('status')
                            ->badge()
                            ->color(fn (string $state): string => match ($state) {
                                Location::STATUS_APPROVED => 'success',
                                Location::STATUS_PENDING => 'warning',
                                Location::STATUS_REJECTED => 'danger',
                                default => 'gray',
                            }),
                        TextEntry::make('check_ins_count')
                            ->label('Check-ins')
                            ->state(fn (Location $record): int => $record->checkIns()->count()),
                        TextEntry::make('geofence_radius_m')
                            ->label('Radius (m)')
                            ->numeric(),
                        TextEntry::make('address')
                            ->placeholder('—')
                            ->columnSpanFull(),
                        TextEntry::make('description')
                            ->placeholder('—')
                            ->columnSpanFull(),
                    ]),

                Section::make('Gallery')
                    ->collapsible()
                    ->schema([
                        ImageEntry::make('image_urls')
                            ->hiddenLabel()
                            ->height(160)
                            ->extraImgAttributes(['class' => 'object-cover rounded-lg'])
                            // Resolve disk paths to absolute URLs while passing
                            // remote seed URLs through, mirroring LocationResource.
                            ->state(fn (Location $record): array => collect($record->image_urls ?? [])
                                ->filter()
                                ->map(fn (string $path): string => Str::startsWith($path, ['http://', 'https://'])
                                    ? $path
                                    : Storage::disk('public')->url($path))
                                ->values()
                                ->all()),
                    ])
                    ->visible(fn (Location $record): bool => ! empty($record->image_urls)),
            ]);
    }
}
