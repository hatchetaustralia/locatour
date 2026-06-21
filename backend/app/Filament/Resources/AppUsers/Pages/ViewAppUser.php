<?php

namespace App\Filament\Resources\AppUsers\Pages;

use App\Filament\Resources\AppUsers\AppUserResource;
use App\Models\AppUser;
use App\Support\Leveling;
use Filament\Actions\Action;
use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;
use Filament\Schemas\Components\Utilities\Get;
use Illuminate\Support\Facades\Auth;

class ViewAppUser extends ViewRecord
{
    protected static string $resource = AppUserResource::class;

    /** Whether the signed-in admin may grant points (super admins only). */
    protected function canGrantPoints(): bool
    {
        return (bool) (Auth::user()?->is_super_admin);
    }

    /**
     * Compute the level + XP outcome of adding $delta points to this user, used
     * by both the live modal preview and the apply step so they can never drift.
     *
     * @return array{newXp:int, newLevel:int, currentLevel:int}
     */
    protected function previewGrant(int $delta): array
    {
        $record = $this->record;
        $newXp = max(0, ((int) $record->total_xp) + $delta);

        return [
            'newXp' => $newXp,
            'newLevel' => Leveling::levelForXp($newXp),
            // Baseline on the curve, not the stored current_level: the stored value
            // can be stale (e.g. hand-set seed data), whereas the level the XP earns
            // is the source of truth — so a 0-point change always reads "no change".
            'currentLevel' => Leveling::levelForXp((int) $record->total_xp),
        ];
    }

    protected function getHeaderActions(): array
    {
        return [
            // Super-admin-only: manually grant (or deduct) points. The modal shows
            // a LIVE preview of the level the user will land on, so the admin can
            // see the effect of a points change before applying it (the OSRS curve
            // is not linear — e.g. 10,000 pts is Level 27, not 40). Recomputes and
            // persists current_level from the new total_xp via App\Support\Leveling.
            Action::make('grantPoints')
                ->label('Grant points')
                ->icon('heroicon-o-plus-circle')
                ->color('warning')
                ->visible(fn (): bool => $this->canGrantPoints())
                ->modalHeading('Grant points')
                ->modalDescription(fn (): string => sprintf(
                    'Current balance: %s XP · Level %d.',
                    number_format((int) $this->record->total_xp),
                    Leveling::levelForXp((int) $this->record->total_xp),
                ))
                ->modalSubmitActionLabel('Apply')
                ->schema([
                    TextInput::make('points')
                        ->label('Points to add')
                        ->helperText('Use a negative number to deduct points.')
                        ->numeric()
                        ->required()
                        ->default(0)
                        ->live(debounce: 300),
                    Placeholder::make('preview')
                        ->label('Resulting level')
                        ->content(function (Get $get): string {
                            $delta = (int) ($get('points') ?? 0);
                            ['newXp' => $newXp, 'newLevel' => $newLevel, 'currentLevel' => $current]
                                = $this->previewGrant($delta);

                            $maxNote = $newLevel >= Leveling::MAX_LEVEL ? ' (max)' : '';
                            if ($newLevel > $current) {
                                $change = sprintf('▲ up %d level%s from Level %d', $newLevel - $current, $newLevel - $current === 1 ? '' : 's', $current);
                            } elseif ($newLevel < $current) {
                                $change = sprintf('▼ down %d level%s from Level %d', $current - $newLevel, $current - $newLevel === 1 ? '' : 's', $current);
                            } else {
                                $change = 'no level change';
                            }

                            return sprintf('%s XP → Level %d%s  (%s)', number_format($newXp), $newLevel, $maxNote, $change);
                        }),
                ])
                ->action(function (array $data): void {
                    abort_unless($this->canGrantPoints(), 403);

                    /** @var AppUser $record */
                    $record = $this->record;
                    $delta = (int) ($data['points'] ?? 0);
                    ['newXp' => $newXp, 'newLevel' => $newLevel] = $this->previewGrant($delta);

                    $record->update([
                        'total_xp' => $newXp,
                        'current_level' => $newLevel,
                    ]);

                    Notification::make()
                        ->title(sprintf('%s%s points', $delta >= 0 ? '+' : '', number_format($delta)))
                        ->body(sprintf('%s is now Level %d (%s XP).', $record->display_name, $newLevel, number_format($newXp)))
                        ->success()
                        ->send();
                }),

            // Block/unblock straight from the user's overview page.
            Action::make('toggleBlock')
                ->label(fn (): string => $this->record->isBlocked() ? 'Unblock account' : 'Block account')
                ->icon(fn (): string => $this->record->isBlocked() ? 'heroicon-o-lock-open' : 'heroicon-o-no-symbol')
                ->color(fn (): string => $this->record->isBlocked() ? 'success' : 'danger')
                ->requiresConfirmation()
                ->modalDescription(fn (): string => $this->record->isBlocked()
                    ? 'Restore this account? The user will be able to sync and check in again.'
                    : 'Block this account? The user will be refused on every authenticated API call.')
                ->action(function (): void {
                    /** @var AppUser $record */
                    $record = $this->record;

                    $record->update([
                        'status' => $record->isBlocked()
                            ? AppUser::STATUS_ACTIVE
                            : AppUser::STATUS_BLOCKED,
                    ]);

                    Notification::make()
                        ->title($record->isBlocked() ? 'Account blocked' : 'Account unblocked')
                        ->success()
                        ->send();
                }),
        ];
    }
}
