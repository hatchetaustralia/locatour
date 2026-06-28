<?php

namespace App\Filament\Resources\Locations\Schemas;

use App\Filament\Forms\Components\LocationMapPicker;
use App\Models\Category;
use App\Models\Location;
use App\Models\Tag;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Slider;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\Group;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Enums\Width;
use Illuminate\Support\HtmlString;
use Illuminate\Support\Str;

class LocationForm
{
    /**
     * True when the current panel user is a moderator or admin (i.e. NOT a
     * plain contributor). Used to show/hide moderation-only fields.
     */
    protected static function isStaff(): bool
    {
        $user = Filament::auth()->user();

        return (bool) ($user && $user->hasAnyRole(['admin', 'moderator']));
    }

    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                // Entry point: search a place (Places API New) → prefills name,
                // address, coords, and the meta below; or drag the pin if it's
                // an unlisted spot (spec 07).
                Section::make('Find the place')
                    ->description('Search to auto-fill everything from Google, or drag the pin for unlisted spots.')
                    ->columnSpanFull()
                    ->columns(2)
                    ->schema([
                        LocationMapPicker::make('map')
                            ->label('Map')
                            ->dehydrated(false)
                            ->columnSpanFull(),
                        // Surfaces the full Google Places payload cached by a
                        // "Sync from Google Places" run (rating, hours, contact,
                        // address parts, photos, raw JSON). Hidden until there's
                        // something synced to show.
                        Actions::make([
                            Action::make('placeDetails')
                                ->label('More information')
                                ->icon('heroicon-o-information-circle')
                                ->color('gray')
                                ->link()
                                ->visible(fn ($livewire): bool => method_exists($livewire, 'syncedPlacesMeta')
                                    && filled($livewire->syncedPlacesMeta()))
                                ->modalHeading('Google Places details')
                                ->modalDescription('Everything pulled from Google for this place.')
                                ->modalWidth(Width::ThreeExtraLarge)
                                ->modalSubmitAction(false)
                                ->modalCancelActionLabel('Close')
                                ->modalContent(fn ($livewire): HtmlString => new HtmlString(
                                    view('filament.locations.place-meta', [
                                        'meta' => $livewire->syncedPlacesMeta(),
                                    ])->render()
                                )),
                        ])
                            ->columnSpanFull(),
                        TextInput::make('latitude')
                            ->numeric()
                            ->required()
                            ->step('0.0000001'),
                        TextInput::make('longitude')
                            ->numeric()
                            ->required()
                            ->step('0.0000001'),
                        Slider::make('geofence_radius_m')
                            ->label('Geofence radius (m)')
                            ->range(
                                minValue: Location::GEOFENCE_RADIUS_MIN,
                                maxValue: Location::GEOFENCE_RADIUS_MAX,
                            )
                            ->step(50)
                            // Snap to whole metres — noUiSlider otherwise emits
                            // floats like 49.99999 that truncate below the min.
                            ->decimalPlaces(0)
                            ->default(Location::GEOFENCE_RADIUS_MIN)
                            ->required()
                            ->live()
                            ->tooltips()
                            ->columnSpanFull()
                            ->helperText('Check-in radius. The blue circle on the map updates as you drag.'),
                    ]),

                // Images sit full-width right after the map (per design).
                Section::make('Images')
                    ->columnSpanFull()
                    ->schema([
                        FileUpload::make('image_urls')
                            ->label('Images')
                            ->image()
                            ->multiple()
                            ->reorderable()
                            ->appendFiles()
                            ->panelLayout('grid')
                            ->disk('public')
                            ->directory('locations')
                            ->visibility('public')
                            ->imageEditor()
                            ->columnSpanFull()
                            ->helperText('Drag to reorder. Uploaded images are served from the public disk; remote seed URLs are preserved.'),
                    ]),

                Section::make('Details')
                    ->columns(2)
                    ->schema([
                        // The slug / app id is auto-derived from the name on
                        // create (CreateLocation::uniqueSlugFrom) and never
                        // changes afterwards — so it's no longer an input.
                        TextInput::make('name')
                            ->required()
                            ->maxLength(255),
                        Select::make('category')
                            ->required()
                            ->options([
                                'parks' => 'Parks',
                                'scenic' => 'Scenic',
                            ]),
                        TextInput::make('address')
                            ->required()
                            ->maxLength(255)
                            ->helperText('Auto-filled by the map search/marker; editable.'),
                        Textarea::make('description')
                            ->rows(4)
                            ->helperText('What is this place? Prefilled from Google\'s summary when available.')
                            ->columnSpanFull(),
                    ]),

                // Points is the single source of truth; tier is derived from it
                // (see PointsTierField + Location::tierForPoints).
                Section::make('Points & tier')
                    ->columns(2)
                    ->schema([
                        // Same native Slider as the geofence control (consistency).
                        // Tier is derived from points and shown live beside it.
                        Slider::make('points')
                            ->label('Points (XP reward)')
                            ->range(minValue: 0, maxValue: Location::maxTierPoints())
                            ->step(50)
                            // Whole points only — noUiSlider otherwise emits
                            // floats like 299.99999 that truncate to 299.
                            ->decimalPlaces(0)
                            ->default(Location::defaultPointsForTier(1))
                            ->required()
                            ->live()
                            ->tooltips()
                            // Tagged so the live tier preview can read this slider
                            // directly and update on every drag (not just release).
                            ->extraAttributes(['data-tier-slider' => 'true'])
                            ->helperText('Drag to set the reward — the tier follows automatically.'),
                        Placeholder::make('tier_preview')
                            ->label('Tier')
                            ->content(fn (Get $get): HtmlString => static::tierPreview((int) round((float) $get('points')))),
                        Toggle::make('is_major_destination')
                            ->label('Major destination')
                            ->columnSpanFull()
                            ->helperText('Always visible to all players, regardless of distance (use only for marquee landmarks).'),
                    ]),

                Section::make('Accessibility & amenities')
                    ->columns(2)
                    ->schema([
                        CheckboxList::make('accessibility')
                            ->label('Wheelchair accessibility')
                            ->options([
                                'entrance' => 'Accessible entrance',
                                'parking' => 'Accessible parking',
                                'restroom' => 'Accessible restroom',
                                'seating' => 'Accessible seating',
                            ])
                            ->live()
                            ->helperText('Prefilled from Google where known. Blank = unknown, not "no".'),
                        CheckboxList::make('amenities')
                            ->label('Amenities on site')
                            ->options([
                                'parking' => 'Parking',
                                'toilets' => 'Toilets',
                                'picnic' => 'Picnic area',
                                'bbq' => 'BBQ facilities',
                                'drinking_water' => 'Drinking water',
                                'shade' => 'Shade / shelter',
                                'playground' => 'Playground',
                                'camping' => 'Camping',
                            ])
                            ->live(),
                        Toggle::make('dog_friendly')
                            ->label('Dog friendly')
                            ->live()
                            ->helperText('Off = no / unknown.'),
                        Toggle::make('family_friendly')
                            ->label('Family / kid friendly')
                            ->live()
                            ->helperText('Off = no / unknown.'),
                        Placeholder::make('suggested_tier')
                            ->label('Suggested tier (from facilities)')
                            ->columnSpanFull()
                            ->content(fn (Get $get): string => static::suggestTier($get)),
                    ]),

                Section::make('Opening hours & visitor info')
                    ->description('Sourced from Google where available — correct anything that\'s wrong.')
                    ->columns(2)
                    ->collapsed()
                    ->schema([
                        Group::make()
                            ->statePath('opening_hours')
                            ->columnSpanFull()
                            ->columns(1)
                            ->schema([
                                Toggle::make('is_24_7')
                                    ->label('Open 24 / 7')
                                    ->live(),
                                Textarea::make('notes')
                                    ->label('Opening hours')
                                    ->rows(4)
                                    ->placeholder("Monday: 9 am – 5 pm\nTuesday: …")
                                    ->visible(fn (Get $get): bool => ! $get('is_24_7')),
                            ]),
                        TextInput::make('website_uri')
                            ->label('Official website')
                            ->url()
                            ->maxLength(2048),
                        TextInput::make('phone')
                            ->label('Phone')
                            ->tel()
                            ->maxLength(64),
                        Select::make('price_level')
                            ->label('Price / entry')
                            ->options([
                                'FREE' => 'Free',
                                'INEXPENSIVE' => 'Inexpensive',
                                'MODERATE' => 'Moderate',
                                'EXPENSIVE' => 'Expensive',
                                'VERY_EXPENSIVE' => 'Very expensive',
                            ])
                            ->placeholder('Unknown'),
                        Select::make('business_status')
                            ->label('Status')
                            ->options([
                                'OPERATIONAL' => 'Open',
                                'CLOSED_TEMPORARILY' => 'Temporarily closed',
                                'CLOSED_PERMANENTLY' => 'Permanently closed',
                            ])
                            ->placeholder('Unknown'),
                        TextInput::make('primary_type_label')
                            ->label('Best for (type)')
                            ->maxLength(255)
                            ->helperText('e.g. Beach, National park, Lookout.'),
                        TextInput::make('directions_uri')
                            ->label('Directions / Maps link')
                            ->url()
                            ->maxLength(2048),
                        TextInput::make('plus_code')
                            ->label('Plus Code')
                            ->maxLength(64)
                            ->helperText('Precise target for spots with no street address.'),
                        TextInput::make('google_rating')
                            ->label('Google rating')
                            ->numeric()
                            ->disabled()
                            ->dehydrated(),
                        TextInput::make('google_rating_count')
                            ->label('Rating count')
                            ->numeric()
                            ->disabled()
                            ->dehydrated(),
                        // Prefilled, not user-edited — kept so they round-trip.
                        Hidden::make('place_id'),
                        Hidden::make('primary_type'),
                        Hidden::make('viewport'),
                    ]),

                Section::make('Tags')
                    ->schema([
                        Select::make('tags')
                            ->label('Tags')
                            ->relationship('tags', 'name')
                            ->multiple()
                            ->searchable()
                            ->preload()
                            // Show "Category — Tag" so admins can tell same-named
                            // tags in different categories apart.
                            ->getOptionLabelFromRecordUsing(fn ($record): string => ($record->category?->name ? $record->category->name.' — ' : '').$record->name)
                            ->createOptionForm([
                                Select::make('category_id')
                                    ->label('Category')
                                    ->options(fn (): array => Category::orderBy('name')->pluck('name', 'id')->all())
                                    ->required()
                                    ->searchable(),
                                TextInput::make('name')
                                    ->label('Tag name')
                                    ->required()
                                    ->maxLength(255),
                            ])
                            // Create the tag inline (slug is derived by the Tag
                            // model's saving hook) and return its id for the
                            // multi-select relationship.
                            ->createOptionUsing(fn (array $data): int => Tag::create([
                                'category_id' => $data['category_id'],
                                'name' => $data['name'],
                                'slug' => Str::slug($data['name']),
                            ])->getKey())
                            ->helperText('Search and add tags. The location\'s categories are derived from its tags.'),
                        TagsInput::make('verification_tags')
                            ->label('Verification tags')
                            ->helperText('Tags the photo verifier should detect (e.g. playground, trees).'),
                    ]),

                // Moderation — only staff (admin/moderator) see and set these.
                // Contributors' submissions are forced to pending + self on
                // create (see CreateLocation) and they cannot change status.
                Section::make('Moderation')
                    ->columns(2)
                    ->visible(fn (): bool => static::isStaff())
                    ->schema([
                        Select::make('status')
                            ->options([
                                Location::STATUS_PENDING => 'Pending',
                                Location::STATUS_APPROVED => 'Approved',
                                Location::STATUS_REJECTED => 'Rejected',
                            ])
                            ->default(Location::STATUS_APPROVED)
                            ->required()
                            ->helperText('Only approved locations appear in the mobile app.'),
                        Toggle::make('active')
                            ->default(true)
                            ->helperText('Inactive locations are hidden from the public API.'),
                        TextInput::make('submitted_by_name')
                            ->label('Submitted by')
                            ->disabled()
                            ->dehydrated(false)
                            ->formatStateUsing(fn (?Location $record) => $record?->submittedBy?->name ?? 'Seed / admin')
                            ->visible(fn (?Location $record): bool => $record !== null),
                    ]),
            ]);
    }

    /**
     * The coloured tier badge + description shown beside the points slider. It
     * renders correct for the given (server-side) points, then an Alpine snippet
     * subscribes to the points slider and recomputes the badge on every drag —
     * so the tier updates live, not only when the slider is released.
     */
    protected static function tierPreview(int $points): HtmlString
    {
        return new HtmlString(
            view('filament.locations.tier-preview', [
                'initialPoints' => $points,
                'bands' => Location::DEFAULT_POINTS_FOR_TIER,
                'rarity' => Location::TIER_RARITY,
                'descriptions' => Location::TIER_DESCRIPTIONS,
            ])->render()
        );
    }

    /**
     * A non-binding tier hint from the facilities: more facilities → more crowd
     * capacity → a LOWER suggested tier; no facilities → fragile → higher (spec 07).
     */
    protected static function suggestTier(Get $get): string
    {
        $score = count((array) $get('accessibility'))
            + count((array) $get('amenities'))
            + ((int) (bool) $get('dog_friendly'))
            + ((int) (bool) $get('family_friendly'));

        [$lo, $hi, $note] = match (true) {
            $score >= 5 => [1, 2, 'high capacity — can take crowds'],
            $score >= 3 => [3, 4, 'good facilities — handles steady visitors'],
            $score >= 1 => [5, 6, 'limited facilities — sensitive to overuse'],
            default => [7, 10, 'no facilities recorded — likely fragile / protect it'],
        };

        $loName = Location::rarityForTier($lo);
        $hiName = Location::rarityForTier($hi);

        return "{$loName}–{$hiName} (Tier {$lo}–{$hi}, {$note}). Set the points to match — this is only a hint.";
    }
}
