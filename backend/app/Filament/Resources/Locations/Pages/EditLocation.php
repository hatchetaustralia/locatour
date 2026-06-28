<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\Concerns\SyncsLocationFromPlaces;
use App\Filament\Resources\Locations\LocationResource;
use App\Models\Location;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditLocation extends EditRecord
{
    use SyncsLocationFromPlaces;

    protected static string $resource = LocationResource::class;

    protected function getHeaderActions(): array
    {
        return [
            $this->googlePlacesSyncAction(),
            $this->generateAiAction(),
            DeleteAction::make(),
        ];
    }

    /**
     * Move ALL current images into the "Current images" repeater so the admin
     * can see + remove + reorder them (the FileUpload can only render files that
     * physically live on the disk, so remote/Google URLs were invisible). The
     * FileUpload is left empty and only collects NEW uploads.
     */
    protected function mutateFormDataBeforeFill(array $data): array
    {
        $images = collect($data['image_urls'] ?? [])
            ->filter(fn ($p) => is_string($p) && $p !== '')
            ->values();

        $data['existing_images'] = $images->map(fn (string $url): array => ['url' => $url])->all();
        $data['image_urls'] = [];

        return $data;
    }

    /**
     * Rebuild image_urls from the repeater (kept images, in their current order)
     * plus any new uploads from the FileUpload, de-duped. Removing a row in the
     * repeater therefore drops it; untouched rows are preserved (no wipe).
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        $kept = collect($data['existing_images'] ?? [])
            ->map(fn ($row) => is_array($row) ? ($row['url'] ?? null) : null)
            ->filter(fn ($url) => is_string($url) && $url !== '')
            ->values()
            ->all();

        $uploaded = array_values(array_filter($data['image_urls'] ?? [], fn ($p) => is_string($p) && $p !== ''));

        $data['image_urls'] = array_values(array_unique(array_merge($kept, $uploaded)));
        unset($data['existing_images']);

        return $data;
    }

    /**
     * Fold any photos captured by a "Sync from Google Places" run into the
     * saved image gallery (image_urls) — runs after the form's own image merge,
     * so synced photos become real, displayed images. No-op on a plain save.
     */
    protected function afterSave(): void
    {
        if ($this->record instanceof Location) {
            $this->persistPlacesPhotos($this->record);
        }
    }
}
