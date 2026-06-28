@php
    /** @var array<string, mixed>|null $meta */
    $meta = $meta ?? [];

    $priceLabels = [0 => 'Free', 1 => 'Inexpensive', 2 => 'Moderate', 3 => 'Expensive', 4 => 'Very expensive'];

    $rating = $meta['rating'] ?? null;
    $ratingCount = $meta['user_ratings_total'] ?? null;
    $priceLevel = $meta['price_level'] ?? null;
    $status = $meta['business_status'] ?? null;
    $phone = $meta['phone'] ?? null;
    $website = $meta['website'] ?? null;
    $types = (array) ($meta['types'] ?? []);
    $summary = $meta['editorial_summary'] ?? null;
    $placeId = $meta['google_place_id'] ?? null;
    $photoUrls = array_values((array) ($meta['photo_urls'] ?? []));
    $raw = (array) ($meta['raw'] ?? []);

    $weekday = $meta['opening_hours']['weekday_text'] ?? null;
    $addressComponents = $raw['addressComponents'] ?? [];

    // synced_at may arrive as a Carbon instance (pending create meta) or a string.
    $syncedAt = $meta['synced_at'] ?? null;
    if ($syncedAt instanceof \Illuminate\Support\Carbon) {
        $syncedAt = $syncedAt->toDayDateTimeString();
    }

    $rows = array_filter([
        'Google rating' => $rating !== null ? number_format((float) $rating, 1) . ' ★' . ($ratingCount ? ' (' . number_format((int) $ratingCount) . ' reviews)' : '') : null,
        'Price level' => is_numeric($priceLevel) ? ($priceLabels[(int) $priceLevel] ?? null) : null,
        'Status' => $status ? \Illuminate\Support\Str::headline(strtolower((string) $status)) : null,
        'Phone' => $phone,
        'Best for (type)' => $types[0] ?? null,
        'Place id' => $placeId,
        'Synced' => $syncedAt,
    ], fn ($v) => filled($v));
@endphp

<div style="display:flex;flex-direction:column;gap:1rem;font-size:0.875rem;">
    @if (empty($meta))
        <p style="opacity:0.7;">No Google Places data has been synced for this location yet. Run “Sync from Google Places” first.</p>
    @else
        <dl style="display:grid;grid-template-columns:max-content 1fr;gap:0.35rem 1rem;margin:0;">
            @foreach ($rows as $label => $value)
                <dt style="font-weight:600;opacity:0.7;white-space:nowrap;">{{ $label }}</dt>
                <dd style="margin:0;">{{ $value }}</dd>
            @endforeach

            @if ($website)
                <dt style="font-weight:600;opacity:0.7;white-space:nowrap;">Website</dt>
                <dd style="margin:0;"><a href="{{ $website }}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">{{ \Illuminate\Support\Str::limit($website, 60) }}</a></dd>
            @endif
        </dl>

        @if ($summary)
            <div>
                <div style="font-weight:600;opacity:0.7;margin-bottom:0.25rem;">Google summary</div>
                <p style="margin:0;line-height:1.4;">{{ $summary }}</p>
            </div>
        @endif

        @if (count($types) > 1)
            <div>
                <div style="font-weight:600;opacity:0.7;margin-bottom:0.25rem;">Types</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.35rem;">
                    @foreach ($types as $type)
                        <span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:0.375rem;background:rgba(120,120,120,0.15);font-size:0.75rem;">{{ str_replace('_', ' ', (string) $type) }}</span>
                    @endforeach
                </div>
            </div>
        @endif

        @if (is_array($weekday) && $weekday !== [])
            <div>
                <div style="font-weight:600;opacity:0.7;margin-bottom:0.25rem;">Opening hours</div>
                <div style="line-height:1.5;">
                    @foreach ($weekday as $line)
                        <div>{{ $line }}</div>
                    @endforeach
                </div>
            </div>
        @endif

        @if (! empty($addressComponents))
            <div>
                <div style="font-weight:600;opacity:0.7;margin-bottom:0.25rem;">Address components</div>
                <div style="line-height:1.5;">
                    @foreach ($addressComponents as $component)
                        <div>
                            <span>{{ $component['longText'] ?? ($component['shortText'] ?? '') }}</span>
                            <span style="opacity:0.5;font-size:0.75rem;"> — {{ implode(', ', (array) ($component['types'] ?? [])) }}</span>
                        </div>
                    @endforeach
                </div>
            </div>
        @endif

        @if (! empty($photoUrls))
            <div>
                <div style="font-weight:600;opacity:0.7;margin-bottom:0.25rem;">Photos ({{ count($photoUrls) }})</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
                    @foreach ($photoUrls as $url)
                        <img src="{{ $url }}" alt="Google photo" style="width:120px;height:90px;object-fit:cover;border-radius:0.5rem;" />
                    @endforeach
                </div>
            </div>
        @endif

        @if (! empty($raw))
            <details>
                <summary style="cursor:pointer;font-weight:600;opacity:0.7;">Raw Google response</summary>
                <pre style="margin-top:0.5rem;max-height:18rem;overflow:auto;padding:0.75rem;border-radius:0.5rem;background:rgba(120,120,120,0.12);font-size:0.7rem;line-height:1.35;white-space:pre-wrap;word-break:break-word;">{{ json_encode($raw, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) }}</pre>
            </details>
        @endif
    @endif
</div>
