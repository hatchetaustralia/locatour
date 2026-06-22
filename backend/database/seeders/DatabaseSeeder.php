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
                'is_super_admin' => true,
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
            // The achievement catalogue (from data/achievements.json). Registered
            // here so a re-seed restores it — it was missing before, which left the
            // table empty after the DB recovery so /api/achievements returned [].
            AchievementSeeder::class,
            LocationSeeder::class,
            // Bulk real WA locations, by region — each idempotent on `name`, so a
            // re-seed / migrate:fresh restores the full ~1,100-spot catalogue
            // (previously these were run by hand and a migrate:fresh wiped them).
            WaLocationsSeeder::class,
            YanchepLocationsSeeder::class,
            WaBulkPerthMetroSeeder::class,
            WaBulkPeelSeeder::class,
            WaBulkSouthWestSeeder::class,
            WaBulkGreatSouthernSeeder::class,
            WaBulkWheatbeltSeeder::class,
            WaBulkGoldfieldsEsperanceSeeder::class,
            WaBulkMidWestSeeder::class,
            WaBulkGascoyneSeeder::class,
            WaBulkPilbaraSeeder::class,
            WaBulkKimberleySeeder::class,
            WaLegendarySeeder::class,
        ]);

        // Locatour is about public land, not food venues — but the bulk Places
        // import pulled in cafes/restaurants (category "food"). Strip them after
        // seeding. A few real places were mis-categorised as food upstream, so
        // rescue those by name first, then delete what's left.
        \App\Models\Location::where('name', 'Hammond Park')->where('category', 'food')->update(['category' => 'parks']);
        \App\Models\Location::whereIn('name', ['Margaret River', 'Margaret River Farmers Market'])->where('category', 'food')->update(['category' => 'scenic']);
        \App\Models\Location::where('category', 'food')->delete();
    }
}
