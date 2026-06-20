<?php

namespace App\Filament\Forms\Components;

use App\Models\Location;
use Filament\Forms\Components\Field;

/**
 * The points (XP reward) control for a location: a slider PLUS a manual number
 * input, kept in sync, with a LIVE tier badge + description that follows where
 * the points land in the compounded bands (spec 07).
 *
 * Points is the single source of truth; the tier is derived from it
 * (Location::tierForPoints) on save. This field owns the `points` state path and
 * is purely client-side for the badge — no Livewire round-trip as you drag.
 *
 * The Alpine component (`pointsTierField`) is registered in the head-injected
 * maps-scripts partial, since inline <script> in a Livewire view never runs.
 */
class PointsTierField extends Field
{
    protected string $view = 'filament.forms.components.points-tier-field';

    /** Slider step (points). Coarse enough to drag the whole 0..22k range. */
    protected int $step = 50;

    public function step(int $step): static
    {
        $this->step = $step;

        return $this;
    }

    public function getStep(): int
    {
        return $this->step;
    }

    public function getMaxPoints(): int
    {
        return Location::maxTierPoints();
    }

    /**
     * The tier bands for the client: each tier's lower points threshold and what
     * the tier means. The Alpine component picks the highest band whose threshold
     * the current points meet.
     *
     * @return array<int, array{tier: int, threshold: int, description: string}>
     */
    public function getBands(): array
    {
        $bands = [];
        foreach (Location::DEFAULT_POINTS_FOR_TIER as $tier => $threshold) {
            $bands[] = [
                'tier' => $tier,
                'threshold' => $threshold,
                'description' => Location::tierDescription($tier),
            ];
        }

        return $bands;
    }
}
