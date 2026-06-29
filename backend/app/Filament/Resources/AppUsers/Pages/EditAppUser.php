<?php

namespace App\Filament\Resources\AppUsers\Pages;

use App\Filament\Resources\AppUsers\AppUserResource;
use Filament\Resources\Pages\EditRecord;

class EditAppUser extends EditRecord
{
    protected static string $resource = AppUserResource::class;
}
