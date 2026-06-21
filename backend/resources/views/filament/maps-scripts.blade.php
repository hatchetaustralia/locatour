{{-- Injected into <head> of every Filament admin page (via a HEAD_END render hook
     in AdminPanelProvider) so these Alpine components are registered BEFORE Alpine
     initialises the page tree. Inline <script> in Livewire component views does not
     execute, and @assets injects too late (after alpine:init) — hence this approach. --}}
<style>
    /* noUiSlider handles (Filament Slider) are 34px wide and sit with right:-17px,
       so at the extremes the handle overhangs the track by 17px — looking like it
       overflows past the field heading. Inset the track 17px each side so the handle
       EDGE lines up with the heading instead. */
    .fi-fo-slider { padding-left: 17px; padding-right: 17px; box-sizing: border-box; }

    /* Filament's .fi-main only sets padding-inline (horizontal), so the last card or
       table on a page sits flush against the bottom window edge with no breathing
       room. Add a bottom gutter globally so every page has comfortable margin under
       its final section. */
    .fi-main { padding-bottom: 2rem; }

    /* Locations list page: move the table SEARCH box to the LEFT. Filament lays
       the header toolbar out as a flex row where the first child is the actions
       group and the SECOND child (the search/filters wrapper) is pushed right
       with `margin-inline-start:auto`. We flip that: order the search wrapper
       first and push everything AFTER it to the right instead. Scoped to the
       Locations resource page so no other table is affected. */
    .fi-resource-locations .fi-ta-header-toolbar > :nth-child(2) {
        order: -1;
        margin-inline-start: 0;
        margin-inline-end: auto;
    }
</style>
<script>
    // Shared Google Maps JS bootstrap loader (loads once per page).
    window.__locatourLoadGoogleMaps = function (apiKey) {
        if (window.google && window.google.maps && window.google.maps.importLibrary) {
            return Promise.resolve();
        }
        if (window.__locatourMapsLoading) {
            return window.__locatourMapsLoading;
        }
        window.__locatourMapsLoading = new Promise((resolve) => {
            ((g) => {
                let h, a, k, b = window, p = 'The Google Maps JavaScript API';
                const c = 'google', l = 'importLibrary', q = '__ib__', m = document;
                b = b[c] || (b[c] = {});
                const d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams();
                const u = () => h || (h = new Promise(async (f, n) => {
                    a = m.createElement('script');
                    e.set('libraries', [...r] + '');
                    for (k in g) e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k]);
                    e.set('callback', c + '.maps.' + q);
                    a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
                    d[q] = f;
                    a.onerror = () => h = n(Error(p + ' could not load.'));
                    a.nonce = m.querySelector('script[nonce]')?.nonce || '';
                    m.head.append(a);
                }));
                d[l] ? console.warn(p + ' only loads once. Ignoring:', g)
                     : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n));
            })({ key: apiKey, v: 'weekly' });
            const check = () => {
                if (window.google?.maps?.importLibrary) resolve();
                else setTimeout(check, 50);
            };
            check();
        });
        return window.__locatourMapsLoading;
    };

    document.addEventListener('alpine:init', () => {
        // --- Points → tier control (slider + manual input + live tier badge) ---
        Alpine.data('pointsTierField', (config) => ({
            points: config.state,
            bands: config.bands || [],
            maxPoints: config.maxPoints || 22000,
            step: config.step || 50,
            // Tier band gradient: low tiers (robust/open) green → high tiers
            // (fragile/protected) purple.
            tierColors: ['#16a34a', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#dc2626', '#9333ea', '#6b21a8'],
            get tier() {
                let t = 1;
                for (const b of this.bands) {
                    if (Number(this.points || 0) >= b.threshold) t = b.tier;
                }
                return t;
            },
            get description() {
                const b = this.bands.find((x) => x.tier === this.tier);
                return b ? b.description : '';
            },
            get nextBand() {
                return this.bands.find((b) => b.threshold > Number(this.points || 0)) || null;
            },
            get tierColor() {
                return this.tierColors[Math.min(9, Math.max(0, this.tier - 1))];
            },
        }));

        // --- Locations overview map (list-page widget) ---
        // One-time CSS that polishes Google's InfoWindow so our card reads as a
        // clean little popup: NO inner scrollbar, NO default close "X", and no
        // forced max-height. Injected once, globally, the first time a map mounts.
        window.__locatourInfoWindowStylesInjected = window.__locatourInfoWindowStylesInjected || false;
        function locatourInjectInfoWindowStyles() {
            if (window.__locatourInfoWindowStylesInjected) return;
            window.__locatourInfoWindowStylesInjected = true;
            const css = `
                /* Remove Google's default close button (the X). We close the popup
                   instead by listening for a click anywhere else on the map. */
                .gm-style-iw button.gm-ui-hover-effect,
                .gm-style .gm-style-iw > button,
                .gm-style-iw-chr { display: none !important; }
                /* Kill the inner scroll: let the card size to its own content. */
                .gm-style-iw.gm-style-iw-c { padding: 0 !important; max-height: none !important; overflow: visible !important; border-radius: 12px !important; box-shadow: 0 6px 24px rgba(0,0,0,.18) !important; }
                .gm-style-iw-d { overflow: hidden !important; max-height: none !important; }
                /* The little arrow/tail container — keep it but drop any padding. */
                .gm-style-iw-tc { top: 0; }
            `;
            const style = document.createElement('style');
            style.id = 'locatour-infowindow-styles';
            style.textContent = css;
            document.head.appendChild(style);
        }

        Alpine.data('locationsOverviewMap', (config) => ({
            popupUrlBase: '',
            createUrl: '',
            map: null,
            info: null,
            markers: [],
            async init() {
                this.popupUrlBase = config.popupUrlBase || '';
                this.createUrl = config.createUrl || '';
                locatourInjectInfoWindowStyles();
                await window.__locatourLoadGoogleMaps(config.apiKey);
                const { Map, InfoWindow } = await google.maps.importLibrary('maps');
                await google.maps.importLibrary('marker');

                this.map = new Map(this.$refs.map, {
                    center: { lat: -31.9523, lng: 115.8613 },
                    zoom: 12,
                    // Map / Satellite toggle (top-right).
                    mapTypeControl: true,
                    mapTypeControlOptions: {
                        position: google.maps.ControlPosition.TOP_RIGHT,
                        mapTypeIds: ['roadmap', 'satellite'],
                    },
                    streetViewControl: false,
                    // Hide the noisy POI categories (schools, businesses, medical,
                    // government, worship, transit) so the map reads cleanly and shows
                    // mostly natural / recreation places worth adding. The kept POIs
                    // (parks, attractions) stay visible AND clickable for quick-add.
                    styles: [
                        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
                        { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
                        { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
                        { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
                        { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
                        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                    ],
                });
                this.info = new InfoWindow({ maxWidth: 320 });

                // A plain map click dismisses the open popup. Clicking a Google POI
                // (a park, attraction, etc. — the noisy categories are hidden) offers
                // to add it as a new location instead of Google's default info window.
                this.map.addListener('click', (e) => {
                    this.info.close();
                    if (e.placeId) {
                        e.stop(); // suppress Google's built-in POI info window
                        this.offerAddPoi(e.placeId, e.latLng);
                    }
                });

                // Plot the current pins, then re-plot whenever the filters above the
                // table change (the hidden #pins element re-renders with new JSON).
                this.renderPins(this.readPins());

                // Livewire re-renders the hidden pins element on filter change; watch
                // its data attribute and re-plot so the map tracks the table.
                this._observer = new MutationObserver(() => this.renderPins(this.readPins()));
                this._observer.observe(this.$refs.pins, { attributes: true, attributeFilter: ['data-pins'] });
            },
            readPins() {
                try {
                    return JSON.parse(this.$refs.pins?.getAttribute('data-pins') || '[]');
                } catch (e) {
                    return [];
                }
            },
            renderPins(pins) {
                if (!this.map) return;
                this.info.close();
                this.markers.forEach((m) => m.setMap(null));
                this.markers = [];

                const bounds = new google.maps.LatLngBounds();
                pins.forEach((pin) => {
                    const marker = new google.maps.Marker({
                        map: this.map,
                        position: { lat: pin.lat, lng: pin.lng },
                        title: `Tier ${pin.tier}`,
                        icon: this.appPinIcon(pin),
                    });
                    bounds.extend(marker.getPosition());
                    marker.addListener('click', () => {
                        // Open immediately with a tiny loading state, then fetch the
                        // rich content lazily so the marker array stays lightweight.
                        this.info.setContent(this.loadingCard());
                        this.info.open(this.map, marker);
                        this.fetchPopup(pin).then((data) => {
                            this.info.setContent(data ? this.popupCard(data) : this.errorCard());
                        });
                    });
                    this.markers.push(marker);
                });

                if (pins.length > 1) {
                    this.map.fitBounds(bounds);
                } else if (pins.length === 1) {
                    this.map.setCenter(bounds.getCenter());
                    this.map.setZoom(13);
                }
            },
            // A clicked Google POI → fetch its details, then show a small card
            // offering to add it as a new Locatour location. The "Add" link opens
            // the create form prefilled (name/address/coords/place_id) for review.
            async offerAddPoi(placeId, latLng) {
                if (!this.createUrl) return;
                try {
                    const { Place } = await google.maps.importLibrary('places');
                    const place = new Place({ id: placeId });
                    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                    const lat = place.location ? place.location.lat() : (latLng ? latLng.lat() : '');
                    const lng = place.location ? place.location.lng() : (latLng ? latLng.lng() : '');
                    const params = new URLSearchParams({
                        name: place.displayName || '',
                        address: place.formattedAddress || '',
                        latitude: lat,
                        longitude: lng,
                        place_id: placeId,
                    });
                    this.info.setContent(this.addPoiCard(place.displayName || '', place.formattedAddress || '', this.createUrl + '?' + params.toString()));
                    this.info.setPosition(latLng);
                    this.info.open(this.map);
                } catch (err) {
                    console.warn('POI lookup failed', err);
                }
            },
            addPoiCard(name, address, href) {
                return (
                    `<div style="width:240px;font-family:inherit;font-size:13px;color:#2a2421;padding:6px 4px">
                        <div style="font-weight:700;font-size:14px;margin-bottom:2px">${this.escape(name) || 'This place'}</div>
                        ${address ? `<div style="color:#8a8076;font-size:12px;margin-bottom:10px">${this.escape(address)}</div>` : '<div style="margin-bottom:10px"></div>'}
                        <a href="${this.escape(href)}" style="display:inline-block;background:#b45309;color:#fff;font-weight:600;text-decoration:none;font-size:13px;padding:7px 13px;border-radius:8px">+ Add as location</a>
                    </div>`
                );
            },
            // Fetch the per-location popup JSON (lazy, on marker click). Returns
            // null on any failure so the caller can show an error card.
            async fetchPopup(pin) {
                try {
                    const url = this.popupUrlBase.replace('__ID__', encodeURIComponent(pin.id));
                    const res = await fetch(url, {
                        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                        credentials: 'same-origin',
                    });
                    if (!res.ok) return null;
                    return await res.json();
                } catch (err) {
                    console.warn('location popup fetch failed', err);
                    return null;
                }
            },
            loadingCard() {
                return `<div style="width:300px;padding:18px 16px;font-size:13px;color:#6b7280;font-family:inherit">Loading…</div>`;
            },
            errorCard() {
                return `<div style="width:300px;padding:18px 16px;font-size:13px;color:#dc2626;font-family:inherit">Couldn’t load this location.</div>`;
            },
            // A polished ~300px card with NO inner scrollbar: a full-width image
            // HEADER (130px, object-fit:cover, rounded top corners), then a tidy
            // body — name, tier · category · points, status badge + check-ins,
            // muted address, and the edit link.
            popupCard(d) {
                const sc = this.statusColor(d.status);
                const checkins = Number(d.checkInCount || 0);
                // Image header (or a soft placeholder band when there's no image) —
                // rounded top corners to match the InfoWindow's rounded frame.
                const header = d.imageUrl
                    ? `<img src="${this.escape(d.imageUrl)}" alt="" style="width:100%;height:130px;object-fit:cover;display:block;border-top-left-radius:12px;border-top-right-radius:12px">`
                    : `<div style="width:100%;height:130px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f3ede7,#e7ddd3);color:#a99e92;font-size:12px;border-top-left-radius:12px;border-top-right-radius:12px">No image</div>`;
                return (
                    `<div style="width:300px;font-family:inherit;font-size:13px;line-height:1.45;color:#2a2421;background:#fff;border-radius:12px;overflow:hidden">
                        ${header}
                        <div style="padding:12px 14px 14px">
                            <div style="font-weight:700;font-size:15px;color:#2a2421;margin-bottom:4px">${this.escape(d.name)}</div>
                            <div style="color:#6b6157;margin-bottom:8px">${this.rarity(d.tier)} · ${this.escape(d.category)} · <strong style="color:#2a2421">+${d.points} pts</strong></div>
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                                <span style="display:inline-block;padding:2px 9px;border-radius:9999px;background:${sc};color:#fff;font-size:11px;font-weight:600;text-transform:capitalize">${this.escape(d.status)}</span>
                                <span style="color:#6b6157;font-size:12px">${checkins} check-in${checkins === 1 ? '' : 's'}</span>
                            </div>
                            ${d.address ? `<div style="color:#8a8076;font-size:12px;margin-bottom:10px">${this.escape(d.address)}</div>` : ''}
                            <a href="${this.escape(d.editUrl)}" style="display:inline-block;color:#b45309;font-weight:600;text-decoration:none;font-size:13px">Edit location →</a>
                        </div>
                    </div>`
                );
            },
            // Match the in-app map markers: a category-coloured "stamp" badge
            // with a dark border, the TIER, and a small status dot + tail.
            // Ascending rarity label for a tier (1..10) — mirrors Location::TIER_RARITY
            // and the app's leveling.ts TIER_RARITY. The compact map marker keeps the
            // numeric tier (a long word won't fit a pin); the popup uses the name.
            rarity(tier) {
                return ['Common', 'Uncommon', 'Rare', 'Prized', 'Epic', 'Iconic', 'Legendary', 'Mythic', 'Ancient', 'Apex'][Math.min(9, Math.max(0, (tier || 1) - 1))];
            },
            categoryColor(category) {
                return ({ parks: '#7DCE96', scenic: '#7DE3E7', food: '#F0B730' })[category] || '#8141DC';
            },
            statusColor(status) {
                return ({ approved: '#16a34a', pending: '#f59e0b', rejected: '#dc2626' })[status] || '#6b7280';
            },
            appPinIcon(pin) {
                const ink = '#2A2421', cream = '#FCF0E8';
                const color = this.categoryColor(pin.category);
                const sc = this.statusColor(pin.status);
                const svg =
                    `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="64" viewBox="0 0 52 64">` +
                    `<path d="M26 62 L17 45 H35 Z" fill="${ink}"/>` +
                    `<rect x="4" y="4" width="44" height="42" rx="11" fill="${ink}"/>` +
                    `<rect x="5.5" y="4" width="41" height="39" rx="9.5" fill="${color}" stroke="${ink}" stroke-width="2.5"/>` +
                    `<text x="26" y="29" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${ink}" text-anchor="middle">T${pin.tier}</text>` +
                    `<circle cx="43" cy="8" r="6.5" fill="${sc}" stroke="${cream}" stroke-width="2"/>` +
                    `</svg>`;
                return {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                    scaledSize: new google.maps.Size(52, 64),
                    anchor: new google.maps.Point(26, 62),
                };
            },
            escape(value) {
                const span = document.createElement('span');
                span.textContent = value ?? '';
                return span.innerHTML;
            },
        }));

        // --- Location map picker (edit-form field) ---
        // Places API (New): search a place → prefill name/address/coords + visitor
        // meta (accessibility, parking, hours, dog/family) + public info (rating,
        // website, phone, price, directions, plus code, type). Not found → drag the
        // marker and fill manually.
        Alpine.data('locationMapPicker', (config) => ({
            map: null, marker: null, circle: null, geocoder: null,
            placesLib: null, sessionToken: null, query: '', suggestions: [], searchTimer: null, searchError: '',
            async init() {
                await window.__locatourLoadGoogleMaps(config.apiKey);
                const { Map } = await google.maps.importLibrary('maps');
                const { Marker } = await google.maps.importLibrary('marker');
                const { Circle } = await google.maps.importLibrary('maps');
                const { Geocoder } = await google.maps.importLibrary('geocoding');

                const lat = this.num(this.$wire.$get(config.latPath), config.defaultLat);
                const lng = this.num(this.$wire.$get(config.lngPath), config.defaultLng);
                const radius = this.num(this.$wire.$get(config.radiusPath), 50);
                const center = { lat, lng };

                this.geocoder = new Geocoder();
                this.map = new Map(this.$refs.map, {
                    center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
                });
                this.marker = new Marker({ map: this.map, position: center, draggable: true });
                this.circle = new Circle({
                    map: this.map, center, radius,
                    strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 2,
                    fillColor: '#3b82f6', fillOpacity: 0.15,
                });
                this.circle.bindTo('center', this.marker, 'position');

                this.marker.addListener('dragend', () => {
                    const pos = this.marker.getPosition();
                    this.writeLatLng(pos.lat(), pos.lng());
                    this.reverseGeocode(pos);
                });
                this.map.addListener('click', (e) => {
                    this.marker.setPosition(e.latLng);
                    this.writeLatLng(e.latLng.lat(), e.latLng.lng());
                    this.reverseGeocode(e.latLng);
                    this.map.panTo(e.latLng);
                });

                await this.initPlaces();
                this.watchRadius(config.radiusPath);
            },
            async initPlaces() {
                try {
                    const lib = await google.maps.importLibrary('places');
                    if (lib.AutocompleteSuggestion && lib.AutocompleteSessionToken) {
                        this.placesLib = lib;
                        this.sessionToken = new lib.AutocompleteSessionToken();
                    } else {
                        console.warn('Places API (New) AutocompleteSuggestion unavailable');
                    }
                } catch (err) {
                    console.warn('Places library unavailable', err);
                }
            },
            // Debounced predictions as the user types into our own search input.
            onSearchInput() {
                const q = (this.query || '').trim();
                clearTimeout(this.searchTimer);
                this.searchError = '';
                if (q.length < 2 || !this.placesLib) {
                    this.suggestions = [];
                    return;
                }
                this.searchTimer = setTimeout(() => this.fetchSuggestions(q), 250);
            },
            async fetchSuggestions(q) {
                try {
                    const req = { input: q, sessionToken: this.sessionToken };
                    const bounds = this.map && this.map.getBounds && this.map.getBounds();
                    if (bounds) req.locationBias = bounds;
                    const { suggestions } = await this.placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
                    this.searchError = '';
                    this.suggestions = (suggestions || [])
                        .filter((s) => s.placePrediction)
                        .slice(0, 6)
                        .map((s) => ({
                            main: s.placePrediction.mainText?.text || s.placePrediction.text?.text || '',
                            secondary: s.placePrediction.secondaryText?.text || '',
                            prediction: s.placePrediction,
                        }));
                } catch (err) {
                    console.warn('autocomplete fetch failed', err);
                    this.suggestions = [];
                    const msg = String((err && err.message) || err);
                    this.searchError = /disabled|has not been used|PERMISSION_DENIED/i.test(msg)
                        ? 'Place search needs the “Places API (New)” enabled in Google Cloud. You can still drag the pin on the map.'
                        : 'Place search is unavailable right now — drag the pin on the map instead.';
                }
            },
            async pickSuggestion(item) {
                this.query = item.main;
                this.suggestions = [];
                try {
                    const place = item.prediction.toPlace();
                    await place.fetchFields({ fields: this.placeFields() });
                    this.applyPlace(place);
                    // Start a fresh session after a completed selection (billing).
                    this.sessionToken = this.placesLib ? new this.placesLib.AutocompleteSessionToken() : null;
                } catch (err) {
                    console.warn('place details failed', err);
                }
            },
            // Places API (New) field mask. Parent objects (accessibilityOptions,
            // parkingOptions) are requested whole to stay on the cheaper SKU tier.
            placeFields() {
                return [
                    'id', 'displayName', 'formattedAddress', 'location', 'viewport',
                    'primaryType', 'primaryTypeDisplayName', 'businessStatus',
                    'googleMapsURI', 'websiteURI', 'nationalPhoneNumber',
                    'rating', 'userRatingCount', 'priceLevel', 'editorialSummary',
                    'regularOpeningHours', 'accessibilityOptions', 'parkingOptions',
                    'allowsDogs', 'isGoodForChildren', 'hasRestroom', 'plusCode',
                ];
            },
            applyPlace(place) {
                const loc = place.location;
                if (loc) {
                    this.map.panTo(loc); this.map.setZoom(15);
                    this.marker.setPosition(loc);
                    this.writeLatLng(loc.lat(), loc.lng());
                }
                if (place.viewport) {
                    try { this.map.fitBounds(place.viewport); } catch (e) {}
                    this.set(this.path('viewport'), this.boundsToBox(place.viewport));
                }
                this.setIf(this.path('name'), place.displayName);
                this.setIf(config.addressPath, place.formattedAddress);
                this.setIf(this.path('description'), place.editorialSummary);
                this.setIf(this.path('place_id'), place.id);
                this.setIf(this.path('directions_uri'), place.googleMapsURI);
                this.setIf(this.path('website_uri'), place.websiteURI);
                this.setIf(this.path('phone'), place.nationalPhoneNumber);
                this.setIf(this.path('plus_code'), place.plusCode?.globalCode);
                this.setIf(this.path('business_status'), place.businessStatus);
                this.setIf(this.path('primary_type'), place.primaryType);
                this.setIf(this.path('primary_type_label'), place.primaryTypeDisplayName);
                this.setIf(this.path('price_level'), place.priceLevel);
                if (typeof place.rating === 'number') this.set(this.path('google_rating'), place.rating);
                if (typeof place.userRatingCount === 'number') this.set(this.path('google_rating_count'), place.userRatingCount);
                if (typeof place.allowsDogs === 'boolean') this.set(this.path('dog_friendly'), place.allowsDogs);
                if (typeof place.isGoodForChildren === 'boolean') this.set(this.path('family_friendly'), place.isGoodForChildren);

                const a = place.accessibilityOptions;
                if (a) {
                    // Array of the accessible aspects that are true (matches the
                    // CheckboxList); a missing/false aspect is simply omitted.
                    const acc = [];
                    if (a.hasWheelchairAccessibleEntrance) acc.push('entrance');
                    if (a.hasWheelchairAccessibleParking) acc.push('parking');
                    if (a.hasWheelchairAccessibleRestroom) acc.push('restroom');
                    if (a.hasWheelchairAccessibleSeating) acc.push('seating');
                    if (acc.length) this.set(this.path('accessibility'), acc);
                }

                const amenities = [];
                const pk = place.parkingOptions;
                if (pk && (pk.hasFreeParkingLot || pk.hasPaidParkingLot || pk.hasFreeStreetParking ||
                    pk.hasPaidStreetParking || pk.hasFreeGarageParking || pk.hasPaidGarageParking || pk.hasValetParking)) {
                    amenities.push('parking');
                }
                if (place.hasRestroom === true) amenities.push('toilets');
                if (amenities.length) this.set(this.path('amenities'), amenities);

                const oh = place.regularOpeningHours;
                if (oh && oh.weekdayDescriptions && oh.weekdayDescriptions.length) {
                    this.set(this.path('opening_hours'), { is_24_7: false, notes: oh.weekdayDescriptions.join('\n') });
                }
            },
            boundsToBox(viewport) {
                const ne = viewport.getNorthEast(), sw = viewport.getSouthWest();
                return { low: { lat: sw.lat(), lng: sw.lng() }, high: { lat: ne.lat(), lng: ne.lng() } };
            },
            watchRadius(radiusPath) {
                this.$watch(`$wire.${radiusPath}`, (value) => {
                    const r = this.num(value, 50);
                    if (this.circle) this.circle.setRadius(r);
                });
            },
            reverseGeocode(latLng) {
                if (!this.geocoder) return;
                this.geocoder.geocode({ location: latLng }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        this.$wire.$set(config.addressPath, results[0].formatted_address);
                    }
                });
            },
            writeLatLng(lat, lng) {
                this.$wire.$set(config.latPath, Number(lat.toFixed(7)));
                this.$wire.$set(config.lngPath, Number(lng.toFixed(7)));
            },
            // Build a qualified state path for a sibling field, e.g. data.website_uri.
            path(field) {
                return config.statePrefix ? `${config.statePrefix}.${field}` : field;
            },
            set(path, value) {
                this.$wire.$set(path, value);
            },
            // Set only when the value is meaningful (skip null/undefined/'' — but
            // booleans incl. false are meaningful and use set() directly).
            setIf(path, value) {
                if (value !== null && value !== undefined && value !== '') {
                    this.$wire.$set(path, value);
                }
            },
            num(value, fallback) {
                const n = parseFloat(value);
                return Number.isFinite(n) ? n : fallback;
            },
        }));
    });
</script>
