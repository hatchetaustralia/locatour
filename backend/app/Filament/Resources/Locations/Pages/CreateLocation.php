<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\Concerns\SyncsLocationFromPlaces;
use App\Filament\Resources\Locations\LocationResource;
use App\Models\Location;
use App\Models\LocationSuggestion;
use Filament\Facades\Filament;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Support\Str;

class CreateLocation extends CreateRecord
{
    use SyncsLocationFromPlaces;

    protected static string $resource = LocationResource::class;

    /**
     * Pre-fill the form from query params when an admin clicks a Google place on
     * the overview map ("Add as location") or approves a community suggestion
     * ("approve → full create"). Only whitelisted fields, only when present —
     * the admin still reviews + sets tier/points before saving.
     */
    public function mount(): void
    {
        parent::mount();

        foreach (['name', 'address', 'place_id', 'category', 'description'] as $field) {
            $value = request()->query($field);
            if (filled($value)) {
                $this->data[$field] = $value;
            }
        }

        foreach (['latitude', 'longitude'] as $field) {
            $value = request()->query($field);
            if (is_numeric($value)) {
                $this->data[$field] = (float) $value;
            }
        }

        $this->prefillFromSuggestion();
    }

    /** The Sync-from-Google-Places + Generate-with-AI enrichment actions. */
    protected function getHeaderActions(): array
    {
        return [
            $this->googlePlacesSyncAction(),
            $this->generateAiAction(),
        ];
    }

    /**
     * Prefill the create form from a community LocationSuggestion when arriving
     * via LocationResource::getUrl('create', ['suggestion' => $id]) — the target
     * of the suggestions "approve → full create" workflow. The admin reviews and
     * sets tier/points/category before saving; nothing is mutated on the
     * suggestion here (that happens when its own approve action runs).
     */
    protected function prefillFromSuggestion(): void
    {
        $suggestionId = request()->query('suggestion');
        if (! filled($suggestionId)) {
            return;
        }

        $suggestion = LocationSuggestion::find($suggestionId);
        if (! $suggestion) {
            return;
        }

        $this->data['name'] ??= $suggestion->name;
        $this->data['latitude'] ??= (float) $suggestion->latitude;
        $this->data['longitude'] ??= (float) $suggestion->longitude;

        // The submitter's free-text notes seed the description for the admin to
        // refine (or replace via "Generate with AI").
        if (filled($suggestion->notes) && blank($this->data['description'] ?? null)) {
            $this->data['description'] = $suggestion->notes;
        }
    }

    /**
     * Persist any Places enrichment captured by the Sync action before the row
     * existed (Create page) into the LocationMeta sidecar now that we have an id.
     */
    protected function afterCreate(): void
    {
        if ($this->pendingPlacesMeta !== null && $this->record instanceof Location) {
            $this->persistPlacesMeta($this->record, $this->pendingPlacesMeta);
            $this->pendingPlacesMeta = null;
        }
    }

    /**
     * Force submission metadata before the record is created.
     *
     * Contributors:
     *   - status is forced to pending (they cannot self-approve)
     *   - submitted_by is forced to their own id
     *   - slug is auto-derived from the name (they don't see/set the slug field)
     *
     * Staff (admin/moderator) keep whatever they entered in the form
     * (status defaults to approved, slug is required in their form).
     */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $user = Filament::auth()->user();

        if ($user && $user->hasRole('contributor') && ! $user->hasAnyRole(['admin', 'moderator'])) {
            $data['status'] = Location::STATUS_PENDING;
            $data['submitted_by'] = $user->id;
            $data['slug'] = $this->uniqueSlugFrom($data['name'] ?? Str::random(8));
        }

        return $data;
    }

    /**
     * Build a unique slug (the app uses string ids like "mueller_park").
     */
    protected function uniqueSlugFrom(string $name): string
    {
        $base = Str::slug($name, '_') ?: Str::random(8);
        $slug = $base;
        $i = 2;

        while (Location::where('slug', $slug)->exists()) {
            $slug = "{$base}_{$i}";
            $i++;
        }

        return $slug;
    }
}
