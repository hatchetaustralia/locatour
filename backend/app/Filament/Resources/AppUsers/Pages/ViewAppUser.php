<?php

namespace App\Filament\Resources\AppUsers\Pages;

use App\Filament\Resources\AppUsers\AppUserResource;
use App\Models\AppUser;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;

class ViewAppUser extends ViewRecord
{
    protected static string $resource = AppUserResource::class;

    protected function getHeaderActions(): array
    {
        return [
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
