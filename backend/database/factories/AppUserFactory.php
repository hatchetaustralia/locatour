<?php

namespace Database\Factories;

use App\Models\AppUser;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AppUser>
 */
class AppUserFactory extends Factory
{
    protected $model = AppUser::class;

    public function definition(): array
    {
        return [
            'device_id' => 'user_'.Str::random(8),
            'display_name' => fake()->name(),
            'username' => fake()->unique()->userName(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => null,
            'bio' => null,
            'avatar_url' => null,
            'gender' => null,
            'home_suburb' => null,
            'interests' => null,
            'total_xp' => 0,
            'current_level' => 1,
            'day_streak' => 0,
            'status' => AppUser::STATUS_ACTIVE,
        ];
    }
}
