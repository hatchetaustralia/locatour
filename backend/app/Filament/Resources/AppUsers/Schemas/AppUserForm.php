<?php

namespace App\Filament\Resources\AppUsers\Schemas;

use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
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

            TextInput::make('home_suburb')
                ->label('Home suburb')
                ->maxLength(255)
                ->nullable()
                ->helperText('Setting a home base lets the user skip onboarding on their next sign-in.'),

            TextInput::make('home_lat')
                ->label('Home latitude')
                ->numeric()
                ->nullable(),

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
