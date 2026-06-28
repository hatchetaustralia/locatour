<?php

namespace App\Filament\Resources\Locations\Pages;

use App\Filament\Resources\Locations\Concerns\SyncsLocationFromPlaces;
use App\Filament\Resources\Locations\LocationResource;
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
     * @var array<int, string>
     */
    protected array $remoteImageUrls = [];

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
}
