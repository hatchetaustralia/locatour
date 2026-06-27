{{-- Admin login: "Sign in with Google" + a grayed (coming-soon) Apple button.
     Inline styles only — Filament's CSS bundle doesn't compile arbitrary Tailwind
     utilities used inside a custom blade (see locatour-backend-sync memory). --}}
<div style="margin-top:1.25rem;">
    <div style="display:flex;align-items:center;gap:.75rem;margin:0 0 1rem;color:#9ca3af;font-size:.75rem;letter-spacing:.05em;">
        <span style="flex:1;height:1px;background:#e5e7eb;"></span>OR<span style="flex:1;height:1px;background:#e5e7eb;"></span>
    </div>

    <a href="{{ route('admin.google.redirect') }}"
       style="display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;height:2.75rem;border:1px solid #d1d5db;border-radius:.5rem;background:#ffffff;color:#1f2937;font-weight:600;text-decoration:none;box-sizing:border-box;">
        <img src="https://www.google.com/favicon.ico" alt="" width="18" height="18" style="display:block;" />
        Sign in with Google
    </a>

    <div title="Coming soon"
         style="display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;height:2.75rem;margin-top:.75rem;border:1px solid #e5e7eb;border-radius:.5rem;background:#f9fafb;color:#9ca3af;font-weight:600;opacity:.6;cursor:not-allowed;box-sizing:border-box;">
        Sign in with Apple (soon)
    </div>
</div>
