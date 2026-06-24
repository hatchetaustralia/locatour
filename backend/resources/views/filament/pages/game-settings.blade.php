<x-filament-panels::page>
    <form wire:submit="save" class="space-y-6">
        {{ $this->gameSettingsForm }}

        <div class="flex justify-end">
            {{ $this->saveAction }}
        </div>
    </form>
</x-filament-panels::page>
