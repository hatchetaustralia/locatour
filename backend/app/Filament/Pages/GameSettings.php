<?php

namespace App\Filament\Pages;

use App\Models\Setting;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Collection;
use UnitEnum;

/**
 * Game Settings — a single admin screen that lists every row of the `settings`
 * table grouped by `group` and typed by `type`, and persists edits back to the
 * DB. Fields are built dynamically from the DB rows, so any new seeded setting
 * shows up here automatically without code changes.
 *
 * Reads/writes go straight through the Setting Eloquent model; saving a row
 * fires Setting::saved which busts the cached settings map (see Setting model),
 * so GET /api/config reflects edits immediately.
 */
class GameSettings extends Page
{
    protected static string | BackedEnum | null $navigationIcon = Heroicon::OutlinedAdjustmentsHorizontal;

    protected static string | UnitEnum | null $navigationGroup = 'Gamification';

    protected static ?string $navigationLabel = 'Game Settings';

    protected static ?string $title = 'Game Settings';

    protected string $view = 'filament.pages.game-settings';

    /**
     * Form state, keyed by Setting `key` (e.g. ['hidden_radius_m' => 50, ...]).
     *
     * @var array<string, int|float|null>
     */
    public array $data = [];

    public function mount(): void
    {
        $state = [];

        foreach (Setting::query()->get() as $setting) {
            $state[$setting->key] = $setting->castValue();
        }

        $this->gameSettingsForm->fill($state);
    }

    public function gameSettingsForm(Schema $schema): Schema
    {
        return $schema
            ->statePath('data')
            ->components($this->buildSections());
    }

    /**
     * Build one Section per `group`, each holding a numeric field per setting.
     *
     * @return array<int, Section>
     */
    protected function buildSections(): array
    {
        $grouped = Setting::query()
            ->orderBy('sort')
            ->get()
            ->groupBy('group');

        return $grouped
            ->map(function (Collection $settings, string $group): Section {
                return Section::make($group)
                    ->columns(2)
                    ->schema(
                        $settings->map(fn (Setting $s) => $this->buildField($s))->all(),
                    );
            })
            ->values()
            ->all();
    }

    protected function buildField(Setting $setting): TextInput
    {
        $isFloat = $setting->type === 'float';

        $field = TextInput::make($setting->key)
            ->label($setting->label ?: $setting->key)
            ->numeric()
            ->required()
            ->step($isFloat ? 0.1 : 1)
            ->helperText($setting->description);

        if ($setting->min !== null) {
            $field->minValue($setting->min);
        }

        if ($setting->max !== null) {
            $field->maxValue($setting->max);
        }

        if (filled($setting->unit)) {
            $field->suffix($setting->unit);
        }

        return $field;
    }

    public function save(): void
    {
        $state = $this->gameSettingsForm->getState();

        Setting::query()->get()->each(function (Setting $setting) use ($state): void {
            if (! array_key_exists($setting->key, $state)) {
                return;
            }

            $value = $state[$setting->key];

            // Defence-in-depth: clamp to the row's documented min/max before
            // persisting, so a crafted/out-of-range submission can't store a
            // value (e.g. a 0 radius or negative cooldown) the app would then
            // faithfully apply. Client-side minValue/maxValue are only hints.
            if ($value !== null && is_numeric($value)) {
                $num = $setting->type === 'float' ? (float) $value : (int) $value;
                if ($setting->min !== null) {
                    $num = max($setting->min, $num);
                }
                if ($setting->max !== null) {
                    $num = min($setting->max, $num);
                }
                $value = $num;
            }

            // Persist as a string; the model casts it back on read. Saving fires
            // Setting::saved which flushes the cached settings map.
            $setting->value = $value === null ? null : (string) $value;
            $setting->save();
        });

        // Belt-and-braces: explicitly flush in case nothing actually changed.
        Setting::flushCache();

        Notification::make()
            ->title('Game settings saved')
            ->success()
            ->send();
    }

    /**
     * @return array<int, Action>
     */
    protected function getHeaderActions(): array
    {
        return [
            $this->saveAction(),
        ];
    }

    /**
     * Registered as $this->saveAction — rendered both in the header and at the
     * foot of the form in the blade view.
     */
    public function saveAction(): Action
    {
        return Action::make('save')
            ->label('Save changes')
            ->action('save')
            ->keyBindings(['mod+s']);
    }
}
