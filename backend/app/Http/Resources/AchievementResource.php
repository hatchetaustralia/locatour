<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AchievementResource extends JsonResource
{
    /**
     * The app-facing shape. `metric` + `threshold` are the rule the app
     * evaluates; `iconName` is an Ionicons glyph.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->key,
            'title' => $this->title,
            'description' => $this->description,
            'difficulty' => $this->difficulty,
            'category' => $this->category,
            'metric' => $this->metric,
            'threshold' => (int) $this->threshold,
            'points' => (int) $this->points,
            'iconName' => $this->icon_name,
        ];
    }
}
