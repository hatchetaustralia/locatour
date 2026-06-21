@php
    $apiKey = $this->getApiKey();
    $pins = $this->getPins();
@endphp

<x-filament-widgets::widget>
    <x-filament::section>
        <x-slot name="heading">Locations overview</x-slot>
        <x-slot name="description">Every location on the map — click a pin to jump to its editor. Markers follow the status &amp; tier filters above the table.</x-slot>

        @unless ($apiKey)
            <div class="rounded-lg border border-warning-300 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
                <strong>Map disabled:</strong> set <code>GOOGLE_MAPS_KEY</code> in <code>.env</code> (with the
                <em>Maps JavaScript API</em> enabled in Google Cloud) to see the overview map.
            </div>
        @else
            <div
                x-data="locationsOverviewMap({
                    apiKey: @js($apiKey),
                    popupUrlBase: @js($this->getPopupUrlBase()),
                })"
            >
                {{-- Pin data is fed via a hidden element that DOES re-render on every
                     Livewire update (the map container itself stays wire:ignore'd so
                     Google keeps its own DOM). When the status/tier filters change the
                     widget re-renders, this JSON changes, and the Alpine $watch below
                     re-plots the markers — keeping the map in sync with the table. --}}
                <div x-ref="pins" data-pins="{{ json_encode($pins) }}" hidden></div>

                <div
                    wire:ignore
                    x-ref="map"
                    style="height: 24rem; width: 100%;"
                    class="overflow-hidden rounded-lg ring-1 ring-gray-950/10 dark:ring-white/20"
                ></div>
            </div>
        @endunless
    </x-filament::section>
</x-filament-widgets::widget>
