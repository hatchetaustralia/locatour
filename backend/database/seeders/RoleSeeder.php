<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleSeeder extends Seeder
{
    /**
     * Create the three application roles and attach the right permissions.
     *
     * - admin       super admin (Shield's gate-before bypass) — full access
     *               to everything, including user/role management.
     * - moderator   full Location CRUD + approve/reject; NO role management.
     * - contributor create + view/edit own pending submissions only.
     *               Fine-grained ownership rules live in LocationPolicy; here
     *               we only grant the coarse Filament permissions the panel
     *               checks to render the resource at all.
     */
    public function run(): void
    {
        // Make sure Shield's permissions exist before we attach them.
        // (Safe to re-run; generate is idempotent.)
        if (Permission::where('name', 'ViewAny:Location')->doesntExist()) {
            Artisan::call('shield:generate', [
                '--all' => true,
                '--option' => 'permissions',
                '--panel' => 'admin',
                '--no-interaction' => true,
            ]);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $guard = 'web';

        // admin — super admin. Shield intercepts the gate for this role name
        // (config/filament-shield.php), so it needs no explicit permissions,
        // but we attach all of them too for clarity / non-gate checks.
        $admin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => $guard]);
        $admin->syncPermissions(Permission::where('guard_name', $guard)->get());

        // moderator — every Location permission, but nothing for the Role
        // resource (cannot manage users/roles).
        $moderator = Role::firstOrCreate(['name' => 'moderator', 'guard_name' => $guard]);
        $moderator->syncPermissions(
            Permission::where('guard_name', $guard)
                ->where('name', 'like', '%:Location')
                ->get()
        );

        // contributor — only the coarse permissions needed to reach the
        // resource: list, view, create, update. NO delete, NO role perms.
        // LocationPolicy narrows view/update to their own pending records and
        // blocks approve/reject.
        $contributor = Role::firstOrCreate(['name' => 'contributor', 'guard_name' => $guard]);
        $contributor->syncPermissions(
            Permission::where('guard_name', $guard)
                ->whereIn('name', [
                    'ViewAny:Location',
                    'View:Location',
                    'Create:Location',
                    'Update:Location',
                ])
                ->get()
        );
    }
}
