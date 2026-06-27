<?php

namespace App\Filament\Resources\AppUsers\Widgets;

use App\Models\AppCheckIn;
use App\Models\AppUser;
use Filament\Widgets\ChartWidget;

class SignupsCheckinsChart extends ChartWidget
{
    protected ?string $heading = 'Sign-ups & check-ins (30 days)';

    // Render full-width above the table rather than in a narrow widget column.
    protected int|string|array $columnSpan = 'full';

    protected function getType(): string
    {
        return 'line';
    }

    protected function getData(): array
    {
        // 30-day window, oldest -> newest. We build the label axis first so both
        // datasets share identical x-axis points (missing days filled with 0).
        $start = now()->subDays(29)->startOfDay();

        // Grouping is done in PHP (not via DB date functions) so the aggregation
        // is portable across Postgres (prod/Neon) and sqlite (local) — no DATE()
        // / DATE_TRUNC SQL that behaves differently per engine.
        $signupsByDay = AppUser::query()
            ->where('created_at', '>=', $start)
            ->get(['created_at'])
            ->groupBy(fn (AppUser $record): string => $record->created_at->format('Y-m-d'))
            ->map
            ->count();

        $checkInsByDay = AppCheckIn::query()
            ->where('created_at', '>=', $start)
            ->get(['created_at'])
            ->groupBy(fn (AppCheckIn $record): string => $record->created_at->format('Y-m-d'))
            ->map
            ->count();

        // Continuous 30-day axis: every day from $start..today, even days with no
        // activity, so the two lines align on the same labels.
        $labels = [];
        $signups = [];
        $checkIns = [];

        for ($day = $start->copy(); $day->lte(now()); $day->addDay()) {
            $key = $day->format('Y-m-d');

            $labels[] = $day->format('M j');
            $signups[] = $signupsByDay->get($key, 0);
            $checkIns[] = $checkInsByDay->get($key, 0);
        }

        return [
            'datasets' => [
                [
                    'label' => 'Sign-ups',
                    'data' => $signups,
                    'borderColor' => '#f59e0b',
                    'backgroundColor' => 'rgba(245, 158, 11, 0.15)',
                ],
                [
                    'label' => 'Check-ins',
                    'data' => $checkIns,
                    'borderColor' => '#3b82f6',
                    'backgroundColor' => 'rgba(59, 130, 246, 0.15)',
                ],
            ],
            'labels' => $labels,
        ];
    }
}
