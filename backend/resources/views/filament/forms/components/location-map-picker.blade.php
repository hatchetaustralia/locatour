@php
    $apiKey = $getApiKey();
    $latPath = $getLatitudePath();
    $lngPath = $getLongitudePath();
    $addressPath = $getAddressPath();
    $radiusPath = $getRadiusPath();
    $statePrefix = $getStatePrefix();
@endphp

<x-dynamic-component :component="$getFieldWrapperView()" :field="$field">
    @unless ($apiKey)
        <div class="rounded-lg border border-warning-300 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
            <strong>Map disabled:</strong> set <code>GOOGLE_MAPS_KEY</code> in <code>.env</code> (with the
            <em>Maps JavaScript API</em> enabled in Google Cloud) to enable the picker. You can still set
            latitude / longitude / radius manually below.
        </div>
    @else
        <div
            wire:ignore
            x-load
            x-data="locationMapPicker({
                apiKey: @js($apiKey),
                latPath: @js($latPath),
                lngPath: @js($lngPath),
                addressPath: @js($addressPath),
                radiusPath: @js($radiusPath),
                statePrefix: @js($statePrefix),
                defaultLat: @js($getDefaultLatitude()),
                defaultLng: @js($getDefaultLongitude()),
            })"
        >
            {{-- Self-contained styles: Filament's CSS bundle does NOT compile the
                 arbitrary Tailwind utilities used in a custom field blade, so the
                 search is styled with its own scoped CSS (dark-mode aware). --}}
            <style>
                [x-cloak] { display: none !important; }
                .loca-search { position: relative; z-index: 30; margin-bottom: 1rem; padding: 0.75rem; border: 1px solid rgba(17,24,39,0.12); border-radius: 0.75rem; background: #f8fafc; }
                .dark .loca-search { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
                .loca-search__label { display: flex; align-items: center; gap: 0.375rem; margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; color: #111827; }
                .dark .loca-search__label { color: #f9fafb; }
                .loca-search__hint { margin: 0 0 0.5rem; font-size: 0.75rem; color: #6b7280; }
                .dark .loca-search__hint { color: #9ca3af; }
                .loca-search__field { position: relative; }
                .loca-search__input { box-sizing: border-box; display: block; width: 100%; height: 2.5rem; padding: 0 0.75rem; font-size: 0.875rem; color: #111827; background: #fff; border: 1px solid rgba(17,24,39,0.2); border-radius: 0.5rem; outline: none; transition: box-shadow .1s, border-color .1s; }
                .loca-search__input::placeholder { color: #9ca3af; }
                .loca-search__input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.35); }
                .dark .loca-search__input { color: #fff; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); }
                .loca-search__dropdown { position: absolute; left: 0; right: 0; top: 100%; z-index: 50; margin-top: 0.25rem; background: #fff; border: 1px solid rgba(17,24,39,0.12); border-radius: 0.5rem; box-shadow: 0 12px 28px rgba(0,0,0,.18); overflow: hidden; }
                .dark .loca-search__dropdown { background: #1f2937; border-color: rgba(255,255,255,0.12); }
                .loca-search__item { display: flex; flex-direction: column; align-items: flex-start; gap: 0.0625rem; width: 100%; padding: 0.5rem 0.75rem; text-align: left; background: transparent; border: 0; border-bottom: 1px solid rgba(17,24,39,0.07); cursor: pointer; }
                .loca-search__item:last-child { border-bottom: 0; }
                .loca-search__item:hover { background: rgba(37,99,235,0.08); }
                .dark .loca-search__item { border-bottom-color: rgba(255,255,255,0.07); }
                .dark .loca-search__item:hover { background: rgba(255,255,255,0.06); }
                .loca-search__main { font-size: 0.875rem; font-weight: 500; color: #111827; }
                .dark .loca-search__main { color: #fff; }
                .loca-search__sub { font-size: 0.75rem; color: #6b7280; }
                .dark .loca-search__sub { color: #9ca3af; }
                .loca-search__error { margin: 0.5rem 0 0; font-size: 0.75rem; color: #b45309; }
                .dark .loca-search__error { color: #fbbf24; }
                .loca-map { height: 22rem; width: 100%; border-radius: 0.5rem; overflow: hidden; border: 1px solid rgba(120,120,120,0.25); }
                .loca-map-hint { margin: 0.5rem 0 0; font-size: 0.75rem; color: #6b7280; }
                .dark .loca-map-hint { color: #9ca3af; }
            </style>
            <div class="loca-search">
                <label class="loca-search__label">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;flex:0 0 auto;">
                        <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                    </svg>
                    Search for a place
                </label>
                <p class="loca-search__hint">Pick a result to auto-fill the name, address, pin and details below. Not listed? Drag the pin on the map.</p>
                <div class="loca-search__field">
                    <input
                        x-ref="search"
                        x-model="query"
                        @input="onSearchInput()"
                        @keydown.escape="suggestions = []"
                        type="text"
                        placeholder="e.g. Yanchep Lagoon, Kings Park…"
                        class="loca-search__input"
                        autocomplete="off"
                    />
                    <div x-show="suggestions.length" x-cloak @click.outside="suggestions = []" class="loca-search__dropdown">
                        <template x-for="(s, i) in suggestions" :key="i">
                            <button type="button" @click="pickSuggestion(s)" class="loca-search__item">
                                <span class="loca-search__main" x-text="s.main"></span>
                                <span class="loca-search__sub" x-show="s.secondary" x-text="s.secondary"></span>
                            </button>
                        </template>
                    </div>
                </div>
                <p x-show="searchError" x-cloak x-text="searchError" class="loca-search__error"></p>
            </div>

            <div x-ref="map" class="loca-map"></div>

            <p class="loca-map-hint">
                Drag the marker to fine-tune the pin. The blue circle is the geofence — it resizes with the radius control below.
            </p>
        </div>

    @endunless
</x-dynamic-component>
