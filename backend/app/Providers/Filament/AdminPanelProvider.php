<?php

namespace App\Providers\Filament;

use App\Filament\Pages\Auth\Register;
use App\Filament\Resources\Locations\LocationResource;
use App\Filament\Resources\Locations\Pages\ListLocations;
use BezhanSalleh\FilamentShield\FilamentShieldPlugin;
use Filament\Http\Middleware\Authenticate;
use Filament\Http\Middleware\AuthenticateSession;
use Filament\Http\Middleware\DisableBladeIconComponents;
use Filament\Http\Middleware\DispatchServingFilamentEvent;
use Filament\Panel;
use Filament\PanelProvider;
use Filament\Support\Colors\Color;
use Filament\Support\Enums\Width;
use Filament\Tables\View\TablesRenderHook;
use Filament\View\PanelsRenderHook;
use Filament\Widgets\AccountWidget;
use Filament\Widgets\FilamentInfoWidget;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('admin')
            ->path('admin')
            ->login()
            // Self-registration is DEV-ONLY. On production the admin is locked to the
            // Google allowlist (GoogleAdminAuthController) — public signup would let
            // anyone create a panel account, so it is disabled outside local.
            ->registration(app()->environment('local') ? Register::class : null)
            ->favicon(asset('favicon.png'))
            ->colors([
                'primary' => Color::Amber,
            ])
            // Use the FULL window width for page content (and the topbar, which shares
            // the same container). Filament's default caps content at 80rem (1280px)
            // and centers it, which on wide monitors leaves a big gap on the right and
            // makes the topbar/avatar stop short of the edge. Full removes the cap; the
            // standard px-4/6/8 gutters still keep content off the very edge.
            ->maxContentWidth(Width::Full)
            // Register the Google-map Alpine components in <head> (before Alpine
            // inits) — see resources/views/filament/maps-scripts.blade.php.
            ->renderHook(
                PanelsRenderHook::HEAD_END,
                fn (): string => view('filament.maps-scripts')->render(),
            )
            // "Sign in with Google" (+ grayed Apple) on the admin login form.
            ->renderHook(
                PanelsRenderHook::AUTH_LOGIN_FORM_AFTER,
                fn (): string => view('filament.google-login-button')->render(),
            )
            // Inject a search field at the START of the Locations list table
            // toolbar (left side).  The default right-side search is disabled via
            // ->searchable(false) on the table so the toolbar layout becomes:
            //   left: [search input]    right: [column-toggle button]
            // The field binds to wire:model.live.debounce.500ms="tableSearch",
            // which is the same Livewire property Filament's built-in search uses.
            ->renderHook(
                TablesRenderHook::TOOLBAR_START,
                fn (): string => <<<'HTML'
                    <div x-id="['input']" class="fi-ta-search-field">
                        <label x-bind:for="$id('input')" class="fi-sr-only">Search</label>
                        <div class="fi-input-wrp flex rounded-lg shadow-sm ring-1 transition duration-75 ring-gray-950/10 focus-within:ring-2 focus-within:ring-primary-600 dark:ring-white/20 dark:focus-within:ring-primary-500">
                            <div class="fi-input-wrp-prefix flex items-center pe-1 ps-3 text-gray-400 dark:text-gray-500">
                                <x-filament::icon icon="heroicon-m-magnifying-glass" class="fi-ta-search-field-icon h-5 w-5" />
                            </div>
                            <input
                                autocomplete="off"
                                maxlength="1000"
                                placeholder="Search locations"
                                type="search"
                                wire:model.live.debounce.500ms="tableSearch"
                                x-bind:id="$id('input')"
                                x-on:keyup="if ($event.key === 'Enter') { $wire.$refresh() }"
                                class="fi-input block h-9 w-full border-none bg-transparent px-3 py-1.5 text-sm text-gray-950 outline-none transition duration-75 placeholder:text-gray-400 focus:ring-0 disabled:text-gray-500 disabled:[-webkit-text-fill-color:theme(colors.gray.500)] dark:text-white dark:placeholder:text-gray-500 dark:disabled:text-gray-400 dark:disabled:[-webkit-text-fill-color:theme(colors.gray.400)] sm:text-sm sm:leading-6"
                            />
                        </div>
                    </div>
                HTML,
                scopes: ListLocations::class,
            )
            ->discoverResources(in: app_path('Filament/Resources'), for: 'App\Filament\Resources')
            ->discoverPages(in: app_path('Filament/Pages'), for: 'App\Filament\Pages')
            ->pages([])
            // Force the "Content" group (Locations / Categories / Tags) to the top
            // of the sidebar. Filament's RedirectToHomeController sends /admin to the
            // FIRST navigation item, so putting Content first — with Locations sorted
            // first inside it — makes the Locations list the landing page now that the
            // empty Dashboard has been removed. (homeUrl below only governs the logo
            // link / post-login redirect, not the bare /admin route.)
            ->navigationGroups([
                'Content',
                'Gamification',
                'Engagement',
                'Contributions',
                'Management',
                'Filament Shield',
            ])
            ->homeUrl(fn (): string => LocationResource::getUrl('index'))
            ->discoverWidgets(in: app_path('Filament/Widgets'), for: 'App\Filament\Widgets')
            ->widgets([
                AccountWidget::class,
                FilamentInfoWidget::class,
            ])
            ->middleware([
                EncryptCookies::class,
                AddQueuedCookiesToResponse::class,
                StartSession::class,
                AuthenticateSession::class,
                ShareErrorsFromSession::class,
                PreventRequestForgery::class,
                SubstituteBindings::class,
                DisableBladeIconComponents::class,
                DispatchServingFilamentEvent::class,
            ])
            ->plugins([
                FilamentShieldPlugin::make(),
            ])
            ->authMiddleware([
                Authenticate::class,
            ]);
    }
}
