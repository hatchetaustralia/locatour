<?php

namespace App\Filament\Forms\Components;

use Filament\Forms\Components\Field;

/**
 * A custom Google Maps picker field for the Filament admin.
 *
 * Renders a map with:
 *   - a Places autocomplete search ("Kings Park" -> fills lat/lng/address),
 *   - a draggable marker for fine-tuning the pin,
 *   - a geofence circle whose radius is bound live to the radius control.
 *
 * It does NOT own a single piece of state — it reads from and writes to the
 * sibling form fields by their state paths (latitude/longitude/address and
 * the geofence radius), so the rest of the form and validation are unchanged.
 *
 * Built as a thin custom field (Blade + Alpine + the Google Maps JavaScript
 * API) rather than cheesegrits/filament-google-maps, which targets Filament
 * v3 and has no v5-compatible release. See spec 06 §3.
 */
class LocationMapPicker extends Field
{
    protected string $view = 'filament.forms.components.location-map-picker';

    /** Dotted state paths of the sibling fields this picker reads/writes. */
    protected string $latitudePath = 'latitude';

    protected string $longitudePath = 'longitude';

    protected string $addressPath = 'address';

    protected string $radiusPath = 'geofence_radius_m';

    /** Fallback map centre when the record has no coordinates yet (Perth CBD). */
    protected float $defaultLatitude = -31.9523;

    protected float $defaultLongitude = 115.8613;

    public function latitudePath(string $path): static
    {
        $this->latitudePath = $path;

        return $this;
    }

    public function longitudePath(string $path): static
    {
        $this->longitudePath = $path;

        return $this;
    }

    public function addressPath(string $path): static
    {
        $this->addressPath = $path;

        return $this;
    }

    public function radiusPath(string $path): static
    {
        $this->radiusPath = $path;

        return $this;
    }

    // Filament form fields live under the container's state path (e.g. "data"),
    // so $wire reads/writes/$watch from JS need the qualified path
    // (e.g. data.geofence_radius_m), not the bare field name.
    protected function qualifyPath(string $path): string
    {
        $container = $this->getContainer()->getStatePath();

        return $container === '' ? $path : $container . '.' . $path;
    }

    public function getLatitudePath(): string
    {
        return $this->qualifyPath($this->latitudePath);
    }

    public function getLongitudePath(): string
    {
        return $this->qualifyPath($this->longitudePath);
    }

    public function getAddressPath(): string
    {
        return $this->qualifyPath($this->addressPath);
    }

    public function getRadiusPath(): string
    {
        return $this->qualifyPath($this->radiusPath);
    }

    /**
     * The form container's state path (e.g. "data"). The picker's JS prepends
     * this to bare field names to prefill siblings from a Places search
     * (data.name, data.website_uri, …), without this field needing a setter per
     * column.
     */
    public function getStatePrefix(): string
    {
        return $this->getContainer()->getStatePath();
    }

    public function getDefaultLatitude(): float
    {
        return $this->defaultLatitude;
    }

    public function getDefaultLongitude(): float
    {
        return $this->defaultLongitude;
    }

    /** The Google Maps JavaScript API key (config/services.php). */
    public function getApiKey(): ?string
    {
        return config('services.google_maps_key');
    }
}
