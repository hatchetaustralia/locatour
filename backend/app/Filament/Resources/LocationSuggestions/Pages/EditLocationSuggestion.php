<?php

namespace App\Filament\Resources\LocationSuggestions\Pages;

use App\Filament\Resources\Locations\LocationResource;
use App\Filament\Resources\LocationSuggestions\LocationSuggestionResource;
use App\Models\LocationSuggestion;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Auth;

class EditLocationSuggestion extends EditRecord
{
    protected static string $resource = LocationSuggestionResource::class;

    protected function getHeaderActions(): array
    {
        return [
            // Reject the suggestion — requires review notes to be set (or entered
            // in the modal). Only shown on pending suggestions.
            Action::make('reject')
                ->label('Reject')
                ->icon('heroicon-o-x-circle')
                ->color('danger')
                ->visible(fn (): bool => $this->record->status === LocationSuggestion::STATUS_PENDING)
                ->requiresConfirmation()
                ->modalHeading('Reject suggestion')
                ->modalDescription('Rejecting this suggestion will mark it as rejected. Please add review notes explaining why.')
                ->modalSubmitActionLabel('Reject')
                ->schema([
                    Textarea::make('review_notes')
                        ->label('Review notes')
                        ->required()
                        ->default(fn (): ?string => $this->record->review_notes)
                        ->rows(3),
                ])
                ->action(function (array $data): void {
                    /** @var LocationSuggestion $record */
                    $record = $this->record;

                    $record->update([
                        'status' => LocationSuggestion::STATUS_REJECTED,
                        'review_notes' => $data['review_notes'],
                        'reviewed_by_id' => Auth::id(),
                        'reviewed_at' => now(),
                    ]);

                    Notification::make()
                        ->title('Suggestion rejected')
                        ->body('The suggestion has been marked as rejected.')
                        ->success()
                        ->send();

                    $this->redirect($this->getResource()::getUrl('index'));
                }),

            // Approve → open the FULL Location create form, prefilled from this
            // suggestion (CreateLocation reads ?suggestion=). Replaces the old
            // one-click "publish name + coords" flow so the admin sets every field
            // (category, points, etc.) before the location is created.
            //
            // We deliberately do NOT mutate the suggestion here: it is marked
            // approved and linked (converted_location_id) by the create flow once
            // the admin actually saves. Marking it on redirect would leave an
            // "approved" suggestion with no location if the admin cancels.
            Action::make('approve')
                ->label('Approve')
                ->icon('heroicon-o-check-circle')
                ->color('success')
                ->visible(fn (): bool => $this->record->status === LocationSuggestion::STATUS_PENDING)
                ->url(fn (): string => LocationResource::getUrl('create', ['suggestion' => $this->record->id])),
        ];
    }
}
