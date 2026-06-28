<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Google Maps JavaScript API key, used by the Filament admin map picker
    // and the locations overview widget. The same key the Expo app uses for
    // the native Maps SDK — but it MUST have the "Maps JavaScript API"
    // enabled in Google Cloud (a separate toggle) or the admin maps render
    // blank. See docs/locatour/05-backend.md.
    'google_maps_key' => env('GOOGLE_MAPS_KEY'),

    // OpenRouter — on-demand LLM copy generation for admin location enrichment
    // (descriptions, tier rationales) from the enriched Places data. Key + model
    // are env-driven; never hardcode the key. See app/Services/OpenRouterService.
    'openrouter' => [
        'key' => env('OPENROUTER_API_KEY'),
        'model' => env('OPENROUTER_MODEL', 'anthropic/claude-3.5-haiku'),
    ],

    // SSO: the Google OAuth *Web* client ID. Google ID tokens minted for the app
    // carry this as their `aud`, and AuthController@google rejects any token whose
    // audience doesn't match. (The Android OAuth client — package + SHA-1 — is also
    // needed in Google Cloud for the app to obtain a token, but only this Web id is
    // verified here.) Apple/phone creds will join this block as they land.
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        // Admin Filament Google login (Socialite). The mobile app uses only client_id.
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT'), // the controller overrides this per-request
        // Comma-separated allowlist of Google emails permitted into the admin panel.
        'admin_emails' => env('ADMIN_GOOGLE_EMAILS', ''),
    ],

];
