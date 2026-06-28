<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\Concerns\SyncsLocationFromPlaces;
use App\Filament\Resources\Locations\LocationResource;
use App\Models\Location;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Str;

class EditLocation extends EditRecord
{
    use SyncsLocationFromPlaces;

    protected static string $resource = LocationResource::class;

    /**
     * Remote (http/https) image URLs preserved across the edit. The
     * FileUpload component only manages uploaded files on the public disk, so
     * we hold any seeded remote URLs aside on fill and merge them back on save
     * (spec 06 §4: "the API merges remote URLs + uploaded files").
     *
     * Public so Livewire persists it across requests: it's populated on the
     * mount/fill request but read on the later save request, and a protected
     * property would reset to [] in between — silently wiping the seed images.
     *
     * @var array<int, string>
     */
    public array $remoteImageUrls = [];

    protected function getHeaderActions(): array
    {
        return [
            $this->googlePlacesSyncAction(),
            $this->generateAiAction(),
            DeleteAction::make(),
        ];
    }

    protected function mutateFormDataBeforeFill(array $data): array
    {
        $images = $data['image_urls'] ?? [];

        $this->remoteImageUrls = collect($images)
            ->filter(fn ($path) => is_string($path) && Str::startsWith($path, ['http://', 'https://']))
            ->values()
            ->all();

        // The FileUpload only sees disk paths; remote URLs are merged back on save.
        $data['image_urls'] = collect($images)
            ->reject(fn ($path) => is_string($path) && Str::startsWith($path, ['http://', 'https://']))
            ->values()
            ->all();

        return $data;
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        $uploaded = array_values($data['image_urls'] ?? []);

        // Remote seed URLs first, then uploaded files, preserving order.
        $data['image_urls'] = array_merge($this->remoteImageUrls, $uploaded);

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
