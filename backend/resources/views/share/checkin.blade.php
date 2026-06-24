@php
    $explorer = $checkIn->appUser?->display_name ?: ($checkIn->appUser?->username ?: 'An explorer');
    $spot = $checkIn->location_name ?: 'a hidden spot';
    $photo = $checkIn->photo_url;
    $when = optional($checkIn->checked_in_at)->format('jS F Y');
    $title = $explorer.' found '.$spot.' on Locatour';
    $desc = $explorer.' checked in at '.$spot.($when ? ' on '.$when : '').' — discover real places near you with Locatour.';
    // The app download. APP_URL must be a PUBLIC domain for this to open off the
    // dev network; swap for App Store / Play Store links before launch.
    $installUrl = url('/locatour.apk');
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <meta name="description" content="{{ $desc }}">

    {{-- Open Graph (Facebook / iMessage / WhatsApp / Discord unfurl) --}}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Locatour">
    <meta property="og:title" content="{{ $title }}">
    <meta property="og:description" content="{{ $desc }}">
    <meta property="og:url" content="{{ url()->current() }}">
    @if ($photo)
        <meta property="og:image" content="{{ $photo }}">
        <meta property="og:image:alt" content="{{ $spot }}">
    @endif

    {{-- Twitter / X card --}}
    <meta name="twitter:card" content="{{ $photo ? 'summary_large_image' : 'summary' }}">
    <meta name="twitter:title" content="{{ $title }}">
    <meta name="twitter:description" content="{{ $desc }}">
    @if ($photo)
        <meta name="twitter:image" content="{{ $photo }}">
    @endif

    <style>
        :root { --bg:#FCF0E8; --ink:#2A2421; --pink:#EA739C; --surface:#FFFDFB; }
        * { box-sizing:border-box; }
        body { margin:0; background:var(--bg); color:var(--ink);
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            display:flex; min-height:100vh; align-items:center; justify-content:center; padding:20px; }
        .card { width:100%; max-width:420px; background:var(--surface); border:2px solid var(--ink);
            border-radius:24px; overflow:hidden; box-shadow:0 10px 30px rgba(42,36,33,0.18); }
        .photo { width:100%; aspect-ratio:4/5; object-fit:cover; display:block; background:#eee; }
        .nophoto { width:100%; aspect-ratio:4/5; background:linear-gradient(135deg,#F58FB0,#EA739C,#E05F8E);
            display:flex; align-items:center; justify-content:center; font-size:64px; }
        .body { padding:20px 22px 24px; }
        .kicker { font-size:13px; font-weight:700; color:var(--pink); letter-spacing:.4px; text-transform:uppercase; margin:0 0 6px; }
        h1 { font-size:24px; line-height:1.2; margin:0 0 6px; }
        .meta { font-size:14px; color:rgba(42,36,33,.65); margin:0 0 18px; }
        .cta { display:block; text-align:center; text-decoration:none; background:var(--ink); color:var(--surface);
            font-weight:700; font-size:16px; padding:15px; border-radius:999px; }
        .foot { text-align:center; font-size:12px; color:rgba(42,36,33,.5); margin-top:14px; }
    </style>
</head>
<body>
    <div class="card">
        @if ($photo)
            <img class="photo" src="{{ $photo }}" alt="{{ $spot }}">
        @else
            <div class="nophoto">👀</div>
        @endif
        <div class="body">
            <p class="kicker">Found on Locatour</p>
            <h1>{{ $spot }}</h1>
            <p class="meta">
                Checked in by {{ $explorer }}@if ($when) · {{ $when }}@endif
                @if ($checkIn->points_earned) · +{{ $checkIn->points_earned }} pts @endif
            </p>
            <a class="cta" href="{{ $installUrl }}">Get Locatour &rarr;</a>
            <p class="foot">Pokémon-Go for the great outdoors. Discover real places near you.</p>
        </div>
    </div>
</body>
</html>
