<?php

namespace App\Filament\Pages\Auth;

use Filament\Auth\Pages\Register as BaseRegister;
use Illuminate\Database\Eloquent\Model;
use SensitiveParameter;

/**
 * Panel self-registration. Newly registered users become contributors by
 * default — they can submit locations for moderation but nothing more.
 */
class Register extends BaseRegister
{
    protected function handleRegistration(#[SensitiveParameter] array $data): Model
    {
        $user = parent::handleRegistration($data);

        $user->assignRole('contributor');

        return $user;
    }
}
