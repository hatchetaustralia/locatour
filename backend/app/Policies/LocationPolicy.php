<?php

namespace App\Policies;

use App\Models\Location;
use App\Models\User;

/**
 * Authorization for locations.
 *
 * The `admin` role is Shield's super admin and short-circuits every check via
 * a Gate::before hook, so the methods here only ever run for moderators and
 * contributors.
 *
 * Roles:
 *  - moderator   full access to ANY location; can approve/reject.
 *  - contributor create new (forced pending + self), and view/edit ONLY their
 *                own still-pending submissions. No delete, no approve, cannot
 *                see other people's submissions.
 */
class LocationPolicy
{
    public function viewAny(User $user): bool
    {
        // Both roles may reach the list; the resource query scopes what a
        // contributor actually sees (own records only).
        return $user->hasAnyRole(['moderator', 'contributor']);
    }

    public function view(User $user, Location $location): bool
    {
        if ($user->hasRole('moderator')) {
            return true;
        }

        return $this->ownsPending($user, $location);
    }

    public function create(User $user): bool
    {
        return $user->hasAnyRole(['moderator', 'contributor']);
    }

    public function update(User $user, Location $location): bool
    {
        if ($user->hasRole('moderator')) {
            return true;
        }

        // Contributors may only edit their own submissions while still pending.
        return $this->ownsPending($user, $location);
    }

    public function delete(User $user, Location $location): bool
    {
        // Contributors can never delete; moderators can.
        return $user->hasRole('moderator');
    }

    public function deleteAny(User $user): bool
    {
        return $user->hasRole('moderator');
    }

    public function restore(User $user, Location $location): bool
    {
        return $user->hasRole('moderator');
    }

    public function forceDelete(User $user, Location $location): bool
    {
        return $user->hasRole('moderator');
    }

    /**
     * Custom ability: move a pending location to approved/rejected.
     * Moderators only (admins bypass via Gate::before).
     */
    public function approve(User $user, Location $location): bool
    {
        return $user->hasRole('moderator');
    }

    /**
     * A contributor owns this location and it is still awaiting moderation.
     */
    protected function ownsPending(User $user, Location $location): bool
    {
        return $user->hasRole('contributor')
            && $location->submitted_by === $user->id
            && $location->status === Location::STATUS_PENDING;
    }
}
