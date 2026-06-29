<?php

namespace App\Filament\Resources\AppUsers\Schemas;

use App\Services\GooglePlacesService;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;

/**
 * Super-admin edit form for a mobile-app end user (AppUser).
 *
 * Intentionally a small, surgical set of fields — the things an admin actually
 * needs to correct (display name, handle, bio, and the home base). Setting a
 * home base in particular lets a user who is stuck re-running onboarding skip it
 * on their next sign-in (the app treats "no home suburb AND no home coords" as
 * "needs onboarding"). Identity (email/google_id) and the XP/level economy are
 * deliberately NOT here — points are changed via the "Grant points" action.
 */
class AppUserForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('display_name')
                ->label('Display name')
                ->maxLength(255),

            TextInput::make('username')
                ->label('Username')
                ->maxLength(255)
                ->helperText('Public handle (stored with its leading @). Admin override — bypasses the in-app availability check.'),

            TextInput::make('email')
                ->label('Email')
                ->email()
                ->disabled()
                ->dehydrated(false)
                ->helperText('Tied to the Google identity — not editable here.'),

            Textarea::make('bio')
                ->label('Bio')
                ->rows(3)
                ->nullable(),

            TextInput::make('gender')
                ->label('Gender')
                ->maxLength(50)
                ->nullable(),

            Select::make('home_suburb')
                ->label('Home suburb')
                ->searchable()
                // Live Google Places autocomplete (locality/sublocality, AU) — the
                // same proxy the app's onboarding uses, so admin + app agree.
                ->getSearchResultsUsing(fn (string $search): array => collect(
                    app(GooglePlacesService::class)->suburbAutocomplete($search)
                )->mapWithKeys(fn ($s) => [$s['description'] => $s['description']])->all())
                // An already-saved suburb string labels itself (no extra lookup).
                ->getOptionLabelUsing(fn ($value): ?string => $value)
                ->live()
                ->afterStateUpdated(function ($state, Set $set): void {
                    // Picking a real suburb resolves + fills the coordinates so the
                    // map warm-starts at the user's home base.
                    if (! $state) {
                        return;
                    }
                    $coords = app(GooglePlacesService::class)->suburbCoordinates(null, (string) $state);
                    if ($coords) {
                        $set('home_lat', $coords['lat']);
                        $set('home_lng', $coords['lng']);
                    }
                })
                ->helperText('Search a real Australian suburb (Google Places). Picking one auto-fills the coordinates below; a home base lets the user skip onboarding on next sign-in.')
                ->nullable(),

            TextInput::make('home_lat')
                ->label('Home latitude')
                ->numeric()
                ->nullable()
                ->helperText('Auto-filled from the suburb — override only if needed.'),

            TextInput::make('home_lng')
                ->label('Home longitude')
                ->numeric()
                ->nullable(),

            TagsInput::make('interests')
                ->label('Interests')
                ->nullable(),
        ]);
    }
}
