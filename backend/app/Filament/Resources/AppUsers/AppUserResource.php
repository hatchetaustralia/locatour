<?php

namespace App\Filament\Resources\AppUsers;

use App\Filament\Resources\AppUsers\Pages\EditAppUser;
use App\Filament\Resources\AppUsers\Pages\ListAppUsers;
use App\Filament\Resources\AppUsers\Pages\ViewAppUser;
use App\Filament\Resources\AppUsers\RelationManagers\CheckInsRelationManager;
use App\Filament\Resources\AppUsers\Schemas\AppUserForm;
use App\Filament\Resources\AppUsers\Schemas\AppUserInfolist;
use App\Filament\Resources\AppUsers\Tables\AppUsersTable;
use App\Models\AppUser;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use UnitEnum;

/**
 * Super-admin-only area to inspect mobile-app end users (AppUser), browse their
 * check-ins + uploaded photos, and block/unblock accounts. This is a read-only
 * monitoring resource: there is no create/edit screen — accounts are created by
 * the app's register API; admins only view and toggle status.
 *
 * Access is gated to Filament admins flagged `is_super_admin` (see the
 * `canAccess()` / `canViewAny()` / `shouldRegisterNavigation()` overrides).
 */
class AppUserResource extends Resource
{
    protected static ?string $model = AppUser::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUserGroup;

    protected static string|UnitEnum|null $navigationGroup = 'Management';

    protected static ?string $navigationLabel = 'App Users';

    protected static ?string $modelLabel = 'App User';

    protected static ?string $pluralModelLabel = 'App Users';

    protected static ?string $recordTitleAttribute = 'display_name';

    /**
     * Hard gate: only super-admins may reach any page of this resource (list,
     * view, relation managers, deep links). Everything else funnels through
     * Filament's `canAccess()`.
     */
    public static function canAccess(): bool
    {
        return auth()->user()?->is_super_admin === true;
    }

    /** Belt-and-braces: the index page also checks view-any authorization. */
    public static function canViewAny(): bool
    {
        return static::canAccess();
    }

    /** Keep the nav item hidden from non-super-admins. */
    public static function shouldRegisterNavigation(): bool
    {
        return static::canAccess();
    }

    public static function form(Schema $schema): Schema
    {
        return AppUserForm::configure($schema);
    }

    public static function infolist(Schema $schema): Schema
    {
        return AppUserInfolist::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AppUsersTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            CheckInsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListAppUsers::route('/'),
            'view' => ViewAppUser::route('/{record}'),
            'edit' => EditAppUser::route('/{record}/edit'),
        ];
    }
}
