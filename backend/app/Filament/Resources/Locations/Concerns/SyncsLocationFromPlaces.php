<?php

namespace App\Filament\Resources\Locations\Concerns;

use App\Models\Location;
use App\Models\LocationMeta;
use App\Services\GooglePlacesService;
use App\Services\OpenRouterService;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Illuminate\Support\Arr;

/**
 * Shared "enrich this location" header actions for the Create + Edit pages.
 *
 *  - Sync from Google Places: resolve a place id from the form's name/coords,
 *    pull Place Details (New), fill EMPTY standard fields (never clobber what
 *    the admin typed), cache the full payload + downloaded photos in the
 *    LocationMeta sidecar.
 *  - Generate with AI: draft the description from the location's known data via
 *    OpenRouter.
 *
 * Both pages bind their form to `$this->data` (statePath "data"), so the actions
 * read/write that array directly — the same mechanism CreateLocation::mount uses
 * to prefill. On the Create page there is no record yet, so a successful sync
 * stashes the meta payload in {@see $pendingPlacesMeta} and the page persists it
 * in afterCreate() once the row exists.
 */
trait SyncsLocationFromPlaces
{
    /**
     * Places payload captured by a sync on the Create page, persisted to a new
     * LocationMeta in afterCreate(). Null on the Edit page (it writes immediately).
     *
     * Public so Livewire keeps it between the sync request and the later
     * create/save request — a protected property resets to null in between, so
     * the captured payload would be lost before afterCreate() runs.
     *
     * @var array<string, mixed>|null
     */
    public ?array $pendingPlacesMeta = null;

    /**
     * Photo URLs downloaded by a sync, folded into the location's real image
     * gallery (locations.image_urls) once the row is saved — that's the field
     * the app and the edit-form gallery display. They're also cached raw in
     * meta.photo_urls; this makes them actual location images.
     *
     * Public for the same cross-request reason as {@see $pendingPlacesMeta}: the
     * sync captures them, but afterCreate()/afterSave() persists them later.
     *
     * @var array<int, string>
     */
    public array $pendingPlacesPhotos = [];

    /**
     * The Places payload to show in the "More information" modal: the persisted
     * sidecar on the Edit page, or the pending (not-yet-saved) sync on the Create
     * page. Null when nothing has been synced — the button stays hidden.
     *
     * @return array<string, mixed>|null
     */
    public function syncedPlacesMeta(): ?array
    {
        if (isset($this->record) && $this->record instanceof Location && $this->record->meta) {
            $meta = $this->record->meta;

            return [
                'google_place_id' => $meta->google_place_id,
                'rating' => $meta->rating,
                'user_ratings_total' => $meta->user_ratings_total,
                'price_level' => $meta->price_level,
                'business_status' => $meta->business_status,
                'website' => $meta->website,
                'phone' => $meta->phone,
                'opening_hours' => $meta->opening_hours,
                'types' => $meta->types,
                'editorial_summary' => $meta->editorial_summary,
                'photo_urls' => $meta->photo_urls,
                'raw' => $meta->raw,
                'synced_at' => $meta->synced_at,
            ];
        }

        return $this->pendingPlacesMeta;
    }

    /** "Sync from Google Places" header action (Create + Edit). */
    protected function googlePlacesSyncAction(): Action
    {
        return Action::make('syncFromPlaces')
            ->label('Sync from Google Places')
            ->icon('heroicon-o-map-pin')
            ->color('gray')
            ->action(function (GooglePlacesService $places): void {
                $name = trim((string) ($this->data['name'] ?? ''));
                $lat = $this->data['latitude'] ?? null;
                $lng = $this->data['longitude'] ?? null;

                // Use an already-captured place id (from a Places pick) when we
                // have one; otherwise resolve from the name + coordinates.
                $placeId = trim((string) ($this->data['place_id'] ?? ''));

                if ($placeId === '') {
                    if ($name === '' || ! is_numeric($lat) || ! is_numeric($lng)) {
                        Notification::make()
                            ->title('Not enough to find the place')
                            ->body('Enter a name and a map position (or pick a place) first, then sync.')
                            ->warning()
                            ->send();

                        return;
                    }

                    $placeId = (string) $places->resolvePlaceId($name, (float) $lat, (float) $lng);
                }

                if ($placeId === '') {
                    Notification::make()
                        ->title('No matching Google place')
                        ->body('Couldn\'t resolve this spot on Google. Pick it from the map search, or fill the details by hand.')
                        ->warning()
                        ->send();

                    return;
                }

                try {
                    $details = $places->details($placeId);
                } catch (\Throwable $e) {
                    Notification::make()
                        ->title('Google Places sync failed')
                        ->body($e->getMessage())
                        ->danger()
                        ->send();

                    return;
                }

                $this->applyPlacesToForm($details);

                // Download photos (resilient — never throws); cache URLs on meta
                // AND fold them into the real image gallery (image_urls) on save.
                $photoUrls = $places->downloadPhotos($placeId, $details['photo_refs'] ?? []);
                $this->pendingPlacesPhotos = $photoUrls;

                $payload = $this->buildMetaPayload($placeId, $details, $photoUrls);

                if (isset($this->record) && $this->record instanceof Location && $this->record->exists) {
                    $this->persistPlacesMeta($this->record, $payload);
                } else {
                    // Create page: no row yet — persist in afterCreate().
                    $this->pendingPlacesMeta = $payload;
                }

                Notification::make()
                    ->title('Synced from Google Places')
                    ->body(sprintf(
                        'Filled any empty fields%s. Open “More information” to see everything Google returned, then save.',
                        $photoUrls === [] ? '' : ' and added '.count($photoUrls).' photo(s) to the gallery',
                    ))
                    ->success()
                    ->send();
            });
    }

    /** "Generate with AI" header action — drafts the description (Create + Edit). */
    protected function generateAiAction(): Action
    {
        return Action::make('generateAi')
            ->label('Generate with AI')
            ->icon('heroicon-o-sparkles')
            ->color('gray')
            ->requiresConfirmation()
            ->modalHeading('Generate the description with AI')
            ->modalDescription('Drafts a description from this location\'s known details. It replaces whatever is currently in the description field.')
            ->modalSubmitActionLabel('Generate')
            ->action(function (OpenRouterService $ai): void {
                $name = trim((string) ($this->data['name'] ?? ''));

                if ($name === '') {
                    Notification::make()
                        ->title('Add a name first')
                        ->body('The AI needs at least the location name to write a description.')
                        ->warning()
                        ->send();

                    return;
                }

                try {
                    $text = $ai->generate($this->buildAiPrompt(), $this->aiSystemPrompt());
                } catch (\Throwable $e) {
                    Notification::make()
                        ->title('AI generation failed')
                        ->body($e->getMessage())
                        ->danger()
                        ->send();

                    return;
                }

                $this->data['description'] = $text;

                Notification::make()
                    ->title('Description drafted')
                    ->body('Review and edit the generated copy, then save.')
                    ->success()
                    ->send();
            });
    }

    /**
     * Fill the standard form fields from a normalised Places payload, only where
     * the admin hasn't already entered a value (never clobber typed-in data).
     *
     * @param  array<string, mixed>  $d  GooglePlacesService::details() output.
     */
    protected function applyPlacesToForm(array $d): void
    {
        $this->fillIfEmpty('name', $d['name'] ?? null);
        $this->fillIfEmpty('address', $d['formatted_address'] ?? $d['short_address'] ?? null);
        $this->fillIfEmpty('description', $d['editorial_summary'] ?? null);

        // Coordinates only when missing — a dragged pin is authoritative.
        if (isset($d['location']['lat'], $d['location']['lng'])) {
            $this->fillIfEmpty('latitude', $d['location']['lat']);
            $this->fillIfEmpty('longitude', $d['location']['lng']);
        }

        $this->fillIfEmpty('website_uri', $d['website'] ?? null);
        $this->fillIfEmpty('phone', $d['phone'] ?? null);
        $this->fillIfEmpty('directions_uri', $d['url'] ?? null);
        $this->fillIfEmpty('plus_code', $d['plus_code'] ?? null);
        $this->fillIfEmpty('primary_type', $d['primary_type'] ?? null);
        $this->fillIfEmpty('primary_type_label', $d['primary_type_label'] ?? null);
        $this->fillIfEmpty('business_status', $d['business_status'] ?? null);
        $this->fillIfEmpty('viewport', $d['viewport'] ?? null);

        // The form's price_level select uses the enum without the PRICE_LEVEL_
        // prefix (FREE, INEXPENSIVE, …); the API gives the prefixed enum.
        if (! empty($d['price_level_label'])) {
            $this->fillIfEmpty('price_level', str_replace('PRICE_LEVEL_', '', (string) $d['price_level_label']));
        }

        // Google rating/count are disabled-but-dehydrated fields — always refresh
        // them from the source of truth (they aren't admin-entered).
        if (isset($d['rating'])) {
            $this->data['google_rating'] = $d['rating'];
        }
        if (isset($d['user_ratings_total'])) {
            $this->data['google_rating_count'] = $d['user_ratings_total'];
        }

        // place_id round-trips on the form; stamp it so a later save records it.
        if (! empty($d['place_id'])) {
            $this->data['place_id'] = $d['place_id'];
        }

        // Opening hours: fill the free-text notes from Google's weekday lines
        // when the admin hasn't written any and it isn't flagged 24/7.
        $weekday = $d['opening_hours']['weekday_text'] ?? null;
        if (is_array($weekday) && $weekday !== []) {
            $hours = (array) ($this->data['opening_hours'] ?? []);
            if (empty($hours['is_24_7']) && blank($hours['notes'] ?? null)) {
                $hours['notes'] = implode("\n", $weekday);
                $this->data['opening_hours'] = $hours;
            }
        }
    }

    /** Set $this->data[$key] only when the current value is blank. */
    protected function fillIfEmpty(string $key, mixed $value): void
    {
        if (filled($value) && blank($this->data[$key] ?? null)) {
            $this->data[$key] = $value;
        }
    }

    /**
     * Prefill the form from a place chosen in the map picker's search (Places
     * autocomplete → select). The picker hands over the WHOLE place payload in
     * ONE Livewire call so every field lands atomically, server-side.
     *
     * This replaces the picker's previous approach of writing each field with
     * its own JS `$wire.$set`: that flurry of ~15 rapid commits raced Livewire's
     * commit/morph cycle and was silently dropped on a real click — the map
     * moved to the place but the form stayed empty (and place_id was never
     * stored, so "Sync from Google Places" then complained it had nothing to go
     * on). A deliberate pick OVERWRITES the Google-sourced fields — the admin
     * explicitly chose this place — but only for the keys the pick provided.
     *
     * Public so the picker's Alpine component can invoke it via $wire on both
     * the Create and Edit pages (both use this trait).
     *
     * @param  array<string, mixed>  $place
     */
    public function prefillFromPlacePick(array $place): void
    {
        // String fields — set when the pick provided a non-empty value.
        foreach ([
            'name', 'address', 'description', 'place_id',
            'directions_uri', 'website_uri', 'phone', 'plus_code',
            'business_status', 'primary_type', 'primary_type_label', 'price_level',
        ] as $key) {
            if (filled($place[$key] ?? null)) {
                $this->data[$key] = $place[$key];
            }
        }

        foreach (['latitude', 'longitude'] as $key) {
            if (isset($place[$key]) && is_numeric($place[$key])) {
                $this->data[$key] = (float) $place[$key];
            }
        }

        // Google rating/count are disabled-but-dehydrated, never admin-entered.
        if (isset($place['google_rating']) && is_numeric($place['google_rating'])) {
            $this->data['google_rating'] = $place['google_rating'];
        }
        if (isset($place['google_rating_count']) && is_numeric($place['google_rating_count'])) {
            $this->data['google_rating_count'] = $place['google_rating_count'];
        }

        // Booleans: false is meaningful (Google says "no"), so set on any bool.
        foreach (['dog_friendly', 'family_friendly'] as $key) {
            if (isset($place[$key]) && is_bool($place[$key])) {
                $this->data[$key] = $place[$key];
            }
        }

        // CheckboxList arrays (accessibility / amenities) — set when non-empty.
        foreach (['accessibility', 'amenities'] as $key) {
            if (! empty($place[$key]) && is_array($place[$key])) {
                $this->data[$key] = array_values($place[$key]);
            }
        }

        if (! empty($place['viewport']) && is_array($place['viewport'])) {
            $this->data['viewport'] = $place['viewport'];
        }

        // Opening hours group: { is_24_7: bool, notes: string }.
        if (! empty($place['opening_hours']) && is_array($place['opening_hours'])) {
            $this->data['opening_hours'] = $place['opening_hours'];
        }
    }

    /**
     * Shape a LocationMeta row from a Places payload (column subset of the
     * sidecar). `synced_at` stamps the enrichment.
     *
     * @param  array<string, mixed>  $d
     * @param  array<int, string>  $photoUrls
     * @return array<string, mixed>
     */
    protected function buildMetaPayload(string $placeId, array $d, array $photoUrls): array
    {
        return [
            'google_place_id' => $placeId,
            'rating' => $d['rating'] ?? null,
            'user_ratings_total' => $d['user_ratings_total'] ?? null,
            'price_level' => $d['price_level'] ?? null,
            'business_status' => $d['business_status'] ?? null,
            'website' => $d['website'] ?? null,
            'phone' => $d['phone'] ?? null,
            'opening_hours' => $d['opening_hours'] ?? null,
            'types' => $d['types'] ?? null,
            'editorial_summary' => $d['editorial_summary'] ?? null,
            'photo_urls' => $photoUrls,
            'raw' => $d['raw'] ?? null,
            'synced_at' => now(),
        ];
    }

    /**
     * Upsert the LocationMeta sidecar for a location (1:1, keyed on location_id).
     *
     * @param  array<string, mixed>  $payload
     */
    protected function persistPlacesMeta(Location $location, array $payload): void
    {
        LocationMeta::updateOrCreate(
            ['location_id' => $location->getKey()],
            $payload,
        );
    }

    /**
     * Fold the synced Places photos into a location's real image gallery
     * (locations.image_urls) and save. The Sync action only cached them in the
     * meta sidecar before; this makes them actual images the app and the form
     * gallery show. De-duped and idempotent — re-syncs reuse the same stable
     * photo URLs, so nothing doubles up.
     */
    protected function persistPlacesPhotos(Location $location): void
    {
        if ($this->pendingPlacesPhotos === []) {
            return;
        }

        $existing = array_values(array_filter((array) $location->image_urls));
        $merged = array_values(array_unique(array_merge($existing, $this->pendingPlacesPhotos)));

        if ($merged !== $existing) {
            $location->image_urls = $merged;
            $location->save();
        }

        $this->pendingPlacesPhotos = [];
    }

    /** System steer for the AI description draft. */
    protected function aiSystemPrompt(): string
    {
        return 'You write short, vivid descriptions of outdoor and public-land destinations in Western Australia '
            .'for a location-discovery game. Be factual and concrete, never salesy. 2–4 sentences, ~50–90 words, '
            .'plain prose with no headings, lists or markdown. Mention what makes the place worth visiting and what '
            .'visitors can do there. If you are unsure of a detail, leave it out rather than inventing it.';
    }

    /** Build the AI prompt from the location's known data (form + any synced meta). */
    protected function buildAiPrompt(): string
    {
        $meta = (isset($this->record) && $this->record instanceof Location)
            ? $this->record->meta
            : null;

        $types = $meta?->types ?? Arr::wrap($this->data['primary_type_label'] ?? []);

        $facts = array_filter([
            'Name' => $this->data['name'] ?? null,
            'Category' => $this->data['category'] ?? null,
            'Best for' => $this->data['primary_type_label'] ?? null,
            'Address' => $this->data['address'] ?? null,
            'Place types' => is_array($types) && $types !== [] ? implode(', ', $types) : null,
            "Google's summary" => ($this->data['description'] ?? null) ?: ($meta?->editorial_summary ?? null),
        ], fn ($v) => filled($v));

        $lines = [];
        foreach ($facts as $label => $value) {
            $lines[] = "{$label}: {$value}";
        }

        return "Write a description for this location.\n\n".implode("\n", $lines);
    }
}
