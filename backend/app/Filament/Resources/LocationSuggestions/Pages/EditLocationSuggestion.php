<?php

namespace App\Filament\Resources\LocationSuggestions\Pages;

use App\Filament\Resources\LocationSuggestions\LocationSuggestionResource;
use App\Models\Location;
use App\Models\LocationSuggestion;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
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

            // Approve the suggestion and publish it as a new Location.
            // Only shown on pending suggestions.
            Action::make('approveAndPublish')
                ->label('Approve & publish')
                ->icon('heroicon-o-check-circle')
                ->color('success')
                ->visible(fn (): bool => $this->record->status === LocationSuggestion::STATUS_PENDING)
                ->modalHeading('Approve & publish location')
                ->modalDescription('Configure the new location before publishing. Name and coordinates are taken from the suggestion.')
                ->modalSubmitActionLabel('Publish location')
                ->schema([
                    Select::make('category')
                        ->label('Category')
                        ->options([
                            'parks' => 'Parks',
                            'scenic' => 'Scenic',
                        ])
                        ->required(),

                    TextInput::make('points')
                        ->label('Points reward')
                        ->helperText(fn (): string => sprintf(
                            'Tier is derived from points (0–%s). Default tier-1 = %s pts.',
                            number_format(Location::maxTierPoints()),
                            number_format(Location::defaultPointsForTier(1)),
                        ))
                        ->numeric()
                        ->required()
                        ->default(Location::defaultPointsForTier(1))
                        ->minValue(0)
                        ->maxValue(Location::maxTierPoints()),

                    Toggle::make('is_major_destination')
                        ->label('Major destination')
                        ->default(false),

                    Toggle::make('active')
                        ->label('Active (visible in app)')
                        ->default(true),
                ])
                ->action(function (array $data): void {
                    /** @var LocationSuggestion $record */
                    $record = $this->record;

                    // Create the Location — tier is auto-derived from points via
                    // the Location::booted() saving hook; slug auto-derives from name.
                    $location = Location::create([
                        'name' => $record->name,
                        'latitude' => $record->latitude,
                        'longitude' => $record->longitude,
                        'category' => $data['category'],
                        'points' => (int) $data['points'],
                        'is_major_destination' => (bool) ($data['is_major_destination'] ?? false),
                        'active' => (bool) ($data['active'] ?? true),
                        'status' => Location::STATUS_APPROVED,
                    ]);

                    // Link suggestion → location and stamp the review.
                    $record->update([
                        'status' => LocationSuggestion::STATUS_APPROVED,
                        'reviewed_by_id' => Auth::id(),
                        'reviewed_at' => now(),
                        'converted_location_id' => $location->id,
                    ]);

                    Notification::make()
                        ->title('Suggestion approved')
                        ->body(sprintf('"%s" has been published as a new location (tier %d).', $location->name, $location->tier))
                        ->success()
                        ->send();

                    $this->redirect($this->getResource()::getUrl('index'));
                }),
        ];
    }
}
