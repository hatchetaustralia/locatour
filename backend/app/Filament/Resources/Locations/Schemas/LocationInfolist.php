<?php

namespace App\Filament\Resources\Locations\Schemas;

use App\Models\Location;
use App\Models\LocationMeta;
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
                            ->label('Rarity')
                            ->badge()
                            ->formatStateUsing(fn (int $state): string => Location::rarityForTier($state))
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

                // Cached Google Places enrichment (LocationMeta sidecar). Admin
                // panel only. Populated by the "Sync from Google Places" action.
                Section::make('Google Places')
                    ->description(fn (Location $record): string => $record->meta?->synced_at
                        ? 'Last synced '.$record->meta->synced_at->diffForHumans()
                        : 'Synced data from Google.')
                    ->columns(3)
                    ->collapsible()
                    ->schema([
                        TextEntry::make('meta.rating')
                            ->label('Google rating')
                            ->placeholder('—')
                            ->formatStateUsing(fn ($state): string => $state === null ? '—' : number_format((float) $state, 1).' ★'),
                        TextEntry::make('meta.user_ratings_total')
                            ->label('Reviews')
                            ->placeholder('—')
                            ->numeric(),
                        TextEntry::make('meta.price_level')
                            ->label('Price level')
                            ->placeholder('—')
                            ->formatStateUsing(fn ($state): string => self::priceLevelLabel($state)),
                        TextEntry::make('meta.business_status')
                            ->label('Status')
                            ->placeholder('—')
                            ->badge(),
                        TextEntry::make('meta.phone')
                            ->label('Phone')
                            ->placeholder('—'),
                        TextEntry::make('meta.website')
                            ->label('Website')
                            ->placeholder('—')
                            ->url(fn ($state): ?string => $state ?: null, true)
                            ->limit(40),
                        TextEntry::make('meta.types')
                            ->label('Types')
                            ->placeholder('—')
                            ->columnSpanFull()
                            ->state(fn (Location $record): ?string => ($t = $record->meta?->types)
                                ? implode(', ', (array) $t)
                                : null),
                        TextEntry::make('meta.opening_hours')
                            ->label('Opening hours')
                            ->placeholder('—')
                            ->columnSpanFull()
                            ->state(fn (Location $record): ?string => self::openingHoursText($record->meta)),
                        TextEntry::make('meta.editorial_summary')
                            ->label('Google summary')
                            ->placeholder('—')
                            ->columnSpanFull(),
                    ])
                    ->visible(fn (Location $record): bool => $record->meta !== null),

                // Photos downloaded from Google Places (meta.photo_urls).
                Section::make('Google photos')
                    ->collapsible()
                    ->schema([
                        ImageEntry::make('meta.photo_urls')
                            ->hiddenLabel()
                            ->height(160)
                            ->extraImgAttributes(['class' => 'object-cover rounded-lg'])
                            ->state(fn (Location $record): array => array_values((array) ($record->meta?->photo_urls ?? []))),
                    ])
                    ->visible(fn (Location $record): bool => ! empty($record->meta?->photo_urls)),

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

    /** Human label for the cached 0–4 Google price level (null/out-of-range → —). */
    protected static function priceLevelLabel(mixed $level): string
    {
        return match ((int) $level) {
            0 => 'Free',
            1 => 'Inexpensive',
            2 => 'Moderate',
            3 => 'Expensive',
            4 => 'Very expensive',
            default => '—',
        };
    }

    /** Google's weekday opening-hours lines as a single block (null when none). */
    protected static function openingHoursText(?LocationMeta $meta): ?string
    {
        $weekday = $meta?->opening_hours['weekday_text'] ?? null;

        return is_array($weekday) && $weekday !== []
            ? implode("\n", $weekday)
            : null;
    }
}
