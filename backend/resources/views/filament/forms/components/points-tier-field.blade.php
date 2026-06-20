@php
    $statePath = $getStatePath();
    $bands = $getBands();
    $maxPoints = $getMaxPoints();
    $step = $getStep();
@endphp

<x-dynamic-component :component="$getFieldWrapperView()" :field="$field">
    <div
        x-data="pointsTierField({
            state: $wire.$entangle('{{ $statePath }}'),
            bands: @js($bands),
            maxPoints: {{ $maxPoints }},
            step: {{ $step }},
        })"
        class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5"
    >
        {{-- Live tier badge + what this tier means --}}
        <div class="mb-4 flex items-start gap-3">
            <span
                class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm"
                :style="`background:${tierColor}`"
                x-text="'T' + tier"
            ></span>
            <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-950 dark:text-white">
                    Tier <span x-text="tier"></span>
                    · <span x-text="Number(points || 0).toLocaleString()"></span> pts
                </div>
                <div class="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400" x-text="description"></div>
            </div>
        </div>

        {{-- Slider --}}
        <input
            type="range"
            min="0"
            :max="maxPoints"
            :step="step"
            x-model.number="points"
            class="w-full cursor-pointer accent-primary-600"
        />
        <div class="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-gray-400">
            <span>0</span>
            <span x-show="nextBand" x-text="nextBand ? ('next: Tier ' + nextBand.tier + ' at ' + nextBand.threshold.toLocaleString() + ' pts') : ''"></span>
            <span x-text="Number(maxPoints).toLocaleString()"></span>
        </div>

        {{-- Manual override --}}
        <div class="mt-3 flex items-center gap-2">
            <input
                type="number"
                min="0"
                :max="maxPoints"
                step="1"
                x-model.number="points"
                class="fi-input block w-32 rounded-lg border-none bg-white px-3 py-2 text-sm text-gray-950 shadow-sm ring-1 ring-gray-950/10 focus:ring-2 focus:ring-primary-600 dark:bg-white/5 dark:text-white dark:ring-white/20"
            />
            <span class="text-xs text-gray-500 dark:text-gray-400">points (XP reward) — type an exact value or drag the slider</span>
        </div>
    </div>
</x-dynamic-component>
