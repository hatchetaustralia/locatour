<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\LocationResource;
use App\Models\Location;
use Filament\Facades\Filament;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Support\Str;

class CreateLocation extends CreateRecord
{
    protected static string $resource = LocationResource::class;

    /**
     * Pre-fill the form from query params when an admin clicks a Google place on
     * the overview map ("Add as location"). Only whitelisted fields, only when
     * present — the admin still reviews + sets tier/points before saving.
     */
    public function mount(): void
    {
        parent::mount();

        foreach (['name', 'address', 'place_id'] as $field) {
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
