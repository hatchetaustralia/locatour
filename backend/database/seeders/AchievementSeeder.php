<?php

namespace Database\Seeders;

use App\Models\Achievement;
use Illuminate\Database\Seeder;

/**
 * Seeds the ~99 generated achievements from database/data/achievements.json.
 * Idempotent (upsert by `key`) so re-running keeps admin edits to other rows.
 */
class AchievementSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('data/achievements.json');

        if (! is_file($path)) {
            $this->command?->warn("achievements.json not found at {$path}; skipping.");

            return;
        }

        $rows = json_decode(file_get_contents($path), true) ?: [];

        foreach ($rows as $row) {
            Achievement::updateOrCreate(
                ['key' => $row['key']],
                [
                    'title' => $row['title'],
                    'description' => $row['description'],
                    'difficulty' => $row['difficulty'],
                    'category' => $row['category'] ?? null,
                    'metric' => $row['metric'],
                    'threshold' => (int) $row['threshold'],
                    'points' => (int) ($row['points'] ?? (Achievement::DIFFICULTIES[$row['difficulty']] ?? 50)),
                    'icon_name' => $row['icon_name'] ?? 'trophy-outline',
                    'sort' => (int) ($row['sort'] ?? 0),
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info('Seeded '.count($rows).' achievements.');
    }
}
