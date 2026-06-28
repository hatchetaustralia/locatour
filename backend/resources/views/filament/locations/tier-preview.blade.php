@php
    // Tier band colours (1 → 10), mirroring the player-facing rarity ramp.
    $colors = ['#16a34a', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#dc2626', '#9333ea', '#6b21a8'];

    // noUiSlider emits points; we need the bands as an ordered [tier, threshold]
    // list so the JS can pick the highest band whose threshold is met.
    $bandPairs = collect($bands)->map(fn ($threshold, $tier) => [$tier, $threshold])->values()->all();
@endphp

<div
    x-data="{
        points: @js($initialPoints),
        bands: @js($bandPairs),
        rarity: @js($rarity),
        descriptions: @js($descriptions),
        colors: @js($colors),
        get tier() {
            let t = 1;
            for (const [tier, threshold] of this.bands) {
                if (this.points >= threshold) {
                    t = tier;
                }
            }
            return t;
        },
        get color() {
            return this.colors[Math.min(9, Math.max(0, this.tier - 1))];
        },
        get label() {
            return (this.rarity[this.tier] ?? '') + ' · Tier ' + this.tier + ' · ' + this.points.toLocaleString() + ' pts';
        },
        get description() {
            return this.descriptions[this.tier] ?? '';
        },
        bind() {
            // The points Slider is tagged with data-tier-slider. Once noUiSlider
            // has initialised on it, read its value and follow every drag update
            // (the slider only writes its Livewire state on release, so we go
            // straight to the source for an instant, live preview).
            const el = document.querySelector('[data-tier-slider]');
            if (el && el.noUiSlider) {
                const read = (v) => {
                    this.points = Math.round(+(Array.isArray(v) ? v[0] : v));
                };
                read(el.noUiSlider.get());
                el.noUiSlider.on('update', read);
                return;
            }
            setTimeout(() => this.bind(), 60);
        },
    }"
    x-init="bind()"
    style="display:flex;align-items:center;gap:0.5rem;"
>
    <span
        x-text="'T' + tier"
        :style="`display:inline-flex;align-items:center;justify-content:center;min-width:2.25rem;height:2.25rem;padding:0 0.6rem;border-radius:0.5rem;background:${color};color:#fff;font-weight:700;`"
    ></span>
    <div>
        <div style="font-weight:600;" x-text="label"></div>
        <div style="font-size:0.75rem;opacity:0.7;line-height:1.3;" x-text="description"></div>
    </div>
</div>
