<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Roles + Shield permissions must exist before we assign them.
        $this->call([
            RoleSeeder::class,
        ]);

        // Admin (super admin) — full access incl. user/role management.
        // Credentials documented in docs/locatour/05-backend.md.
        $admin = User::updateOrCreate(
            ['email' => 'admin@locatour.test'],
            [
                'name' => 'Admin',
                'password' => Hash::make('password'),
            ]
        );
        $admin->syncRoles(['admin']);

        // Example contributor — can submit locations for moderation only.
        $contributor = User::updateOrCreate(
            ['email' => 'contributor@locatour.test'],
            [
                'name' => 'Casey Contributor',
                'password' => Hash::make('password'),
            ]
        );
        $contributor->syncRoles(['contributor']);

        // Categories + tags must exist before LocationSeeder attaches them.
        $this->call([
            CategorySeeder::class,
            LocationSeeder::class,
        ]);
    }
}
