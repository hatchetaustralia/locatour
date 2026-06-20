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
        Alpine.data('locationsOverviewMap', (config) => ({
            async init() {
                await window.__locatourLoadGoogleMaps(config.apiKey);
                const { Map, InfoWindow } = await google.maps.importLibrary('maps');
                const { Marker } = await google.maps.importLibrary('marker');

                const pins = config.pins || [];
                const center = pins.length
                    ? {
                        lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length,
                        lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length,
                    }
                    : { lat: -31.9523, lng: 115.8613 };

                const map = new Map(this.$refs.map, {
                    center,
                    zoom: pins.length ? 11 : 12,
                    mapTypeControl: false,
                    streetViewControl: false,
                });

                const bounds = new google.maps.LatLngBounds();
                const info = new InfoWindow();

                pins.forEach((pin) => {
                    const marker = new Marker({
                        map,
                        position: { lat: pin.lat, lng: pin.lng },
                        title: `${pin.name} (T${pin.tier})`,
                        icon: this.appPinIcon(pin),
                    });
                    bounds.extend(marker.getPosition());
                    marker.addListener('click', () => {
                        info.setContent(
                            // Google's InfoWindow is always a white box, so set an
                            // explicit dark colour — otherwise it inherits Filament's
                            // dark-mode light text and goes invisible on white.
                            `<div style="font-size:13px;line-height:1.5;color:#2a2421">
                                <strong style="color:#2a2421">${this.escape(pin.name)}</strong><br>
                                Tier ${pin.tier} · ${this.escape(pin.category)} · ${this.escape(pin.status)}<br>
                                <a href="${pin.editUrl}" style="color:#2563eb;font-weight:600">Edit location →</a>
                            </div>`
                        );
                        info.open(map, marker);
                    });
                });

                if (pins.length > 1) map.fitBounds(bounds);
            },
            // Match the in-app map markers: a category-coloured "stamp" badge
            // with a dark border, the points, and a small status dot + tail.
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
                    `<text x="26" y="29" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${ink}" text-anchor="middle">+${pin.points}</text>` +
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
