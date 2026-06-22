import { Platform } from 'react-native';
import { User, ExploreLocation, CheckIn, Achievement, Coordinates } from '../types';
import { deriveLevelStats, CHECKIN_COOLDOWN_H, maxDiscoverableTier, REACH_RADIUS_M } from './leveling';
import { API_URLS, API_TIMEOUT_MS } from '../constants/config';
import { ACHIEVEMENTS as ACHIEVEMENTS_CATALOGUE, AchievementDef } from '../constants/achievements';

// Let's create mock data
const INITIAL_LOCATIONS: ExploreLocation[] = [
  {
    id: 'mueller_park',
    name: 'Mueller Park',
    category: 'parks',
    coordinates: { latitude: -31.9472, longitude: 115.8291 },
    address: 'Subiaco WA 6008',
    points: 300,
    description: 'A beautiful family park in Subiaco featuring a custom play space, a double slide, and beautiful green lawns perfect for picnics and family gatherings.',
    imageUrls: [
      'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['playground', 'trees', 'park', 'slide', 'grass'],
    createdAt: '2026-01-10T12:00:00Z',
    tier: 1
  },
  {
    id: 'kings_park_lookout',
    name: 'Kings Park Lookout',
    category: 'scenic',
    coordinates: { latitude: -31.9610, longitude: 115.8422 },
    address: 'Fraser Ave, Perth WA 6005',
    points: 500,
    description: 'A gorgeous scenic viewpoint overlooking the Swan River and Perth CBD. Ideal for sunrise and sunset photography with beautiful botanic gardens.',
    imageUrls: [
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['city view', 'river', 'lookout', 'war memorial', 'garden'],
    createdAt: '2026-01-12T12:00:00Z',
    tier: 1,
    isMajorDestination: true
  },
  {
    id: 'locatour_hq_cafe',
    name: 'Locatour HQ Cafe',
    category: 'food',
    coordinates: { latitude: -31.9530, longitude: 115.8570 },
    address: '45 St Georges Terrace, Perth WA 6000',
    points: 150,
    description: 'Step into our cozy local cafe! Fuel up with premium coffee, enjoy hot bagels, and plan your next street exploration adventure.',
    imageUrls: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['coffee', 'cafe', 'neon sign', 'espresso', 'barista'],
    createdAt: '2026-01-15T12:00:00Z',
    tier: 1
  },
  {
    id: 'st_georges_terrace',
    name: "St George's Terrace",
    category: 'scenic',
    coordinates: { latitude: -31.9567, longitude: 115.8598 },
    address: 'St Georges Terrace, Perth WA 6000',
    points: 300,
    description: 'The architectural heart of the city. Look up at the high-rises and explore historical buildings tucked between modern skyscrapers.',
    imageUrls: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['skyscrapers', 'street', 'historic building', 'office'],
    createdAt: '2026-02-01T12:00:00Z',
    tier: 1
  },
  {
    id: 'hyde_park_lake',
    name: 'Hyde Park Lake',
    category: 'parks',
    coordinates: { latitude: -31.9392, longitude: 115.8624 },
    address: 'Vincent St, Perth WA 6000',
    points: 300,
    description: 'Hyde Park is a tranquil inner-city park featuring two lakes, giant plane trees, walking tracks, and active bird-watching points.',
    imageUrls: [
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['lake', 'ducks', 'big trees', 'gazebos', 'pathway'],
    createdAt: '2026-02-10T12:00:00Z',
    tier: 1
  },
  {
    id: 'yanchep_lagoon',
    name: 'Yanchep Lagoon',
    category: 'scenic',
    coordinates: { latitude: -31.5499347, longitude: 115.6241774 },
    address: '5 Brazier Rd, Yanchep WA 6035',
    points: 300,
    description: 'A stunning coastal lagoon with calm turquoise water sheltered by a limestone reef — a local favourite for snorkelling, swimming and sunset picnics.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['beach', 'lagoon', 'ocean', 'reef', 'sand'],
    createdAt: '2026-06-20T00:00:00Z',
    tier: 1,
    geofenceRadius: 300
  },
  {
    id: 'yanchep_national_park',
    name: 'Yanchep National Park',
    category: 'parks',
    coordinates: { latitude: -31.5487, longitude: 115.68533 },
    address: 'Yanchep Beach Rd & Indian Ocean Dr, Yanchep WA 6035',
    points: 100,
    description: 'Spot wild koalas, kangaroos and black cockatoos in this much-loved bushland park, then wander the boardwalks around the wetlands. A great day out for the whole family.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 250
  },
  {
    id: 'yanchep_crystal_cave',
    name: 'Yanchep Crystal Cave',
    category: 'scenic',
    coordinates: { latitude: -31.54757, longitude: 115.69266 },
    address: 'Yanchep WA 6035',
    points: 350,
    description: 'Descend underground into a glittering limestone cave full of delicate stalactites and reflective pools. A cool, otherworldly hideaway beneath the bush.',
    imageUrls: [
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 150
  },
  {
    id: 'loch_mcness',
    name: 'Loch McNess',
    category: 'parks',
    coordinates: { latitude: -31.53389, longitude: 115.67556 },
    address: 'Loch McNess, Yanchep WA 6035',
    points: 200,
    description: 'A peaceful spring-fed lake fringed by paperbarks and reeds, brilliant for a lazy paddle or a picnic with the local waterbirds.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 200
  },
  {
    id: 'two_rocks_marina',
    name: 'Two Rocks Marina',
    category: 'scenic',
    coordinates: { latitude: -31.49484, longitude: 115.58299 },
    address: '1 Pope St, Two Rocks WA 6037',
    points: 200,
    description: 'A breezy working marina where fishing boats bob beside the breakwater. Grab some fish and chips and watch the sun melt into the Indian Ocean.',
    imageUrls: [
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 250
  },
  {
    id: 'pipidinny_beach',
    name: 'Pippidinny Beach',
    category: 'scenic',
    coordinates: { latitude: -31.5843, longitude: 115.64488 },
    address: 'Pippidinny Rd, Eglinton WA 6034',
    points: 200,
    description: 'A wild, dune-backed stretch of coast with rarely a soul in sight — perfect for long beach walks and 4WD adventures away from the crowds.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 300
  },
  {
    id: 'mary_lindsay_homestead',
    name: 'Mary Lindsay Homestead',
    category: 'parks',
    coordinates: { latitude: -31.54474, longitude: 115.62294 },
    address: 'Capricorn Esplanade, Yanchep WA 6035',
    points: 100,
    description: 'A charming heritage homestead and green reserve right by the coast, with shady lawns and a slice of local history to soak up.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 150
  },
  {
    id: 'yanchep_beach',
    name: 'Yanchep Beach',
    category: 'scenic',
    coordinates: { latitude: -31.54115, longitude: 115.61677 },
    address: 'Yanchep Beach, Yanchep WA 6035',
    points: 100,
    description: 'Soft white sand and clear shallows make this the go-to swimming beach for Yanchep locals. Sunsets here are pure gold.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 300
  },
  {
    id: 'yanchep_sun_city_country_club',
    name: 'Yanchep Sun City Country Club',
    category: 'parks',
    coordinates: { latitude: -31.54646, longitude: 115.65422 },
    address: '144 St Andrews Dr, Yanchep WA 6035',
    points: 100,
    description: 'Rolling green fairways and big coastal skies — a relaxed spot for a round of golf or just a stroll past the manicured greens.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 200
  },
  {
    id: 'capricorn_esplanade',
    name: 'Capricorn Esplanade',
    category: 'scenic',
    coordinates: { latitude: -31.54174, longitude: 115.62111 },
    address: 'Capricorn Esplanade, Yanchep WA 6035',
    points: 100,
    description: 'A breezy beachfront esplanade lined with grassy foreshore and ocean views — ideal for a coffee, a picnic or a sunset cycle.',
    imageUrls: [
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 200
  },
  {
    id: 'wreck_point',
    name: 'Wreck Point',
    category: 'scenic',
    coordinates: { latitude: -31.50286, longitude: 115.58392 },
    address: '8 Marcon St, Two Rocks WA 6037',
    points: 350,
    description: 'A rugged coastal lookout with sweeping ocean panoramas and crashing surf below. A quiet vantage point that rewards those who seek it out.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 150
  },
  {
    id: 'wa_elizabeth_quay',
    name: 'Elizabeth Quay',
    category: 'scenic',
    coordinates: { latitude: -31.9575763, longitude: 115.85698740000001 },
    address: 'The Esplanade, Perth WA 6000, Australia',
    points: 100,
    description: 'A buzzing riverside precinct of waterfront promenades, bridges and pop-up bars right on the Swan River. The beating heart of modern Perth.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 250
  },
  {
    id: 'wa_bell_tower',
    name: 'The Bell Tower',
    category: 'scenic',
    coordinates: { latitude: -31.9590003, longitude: 115.85829550000001 },
    address: 'Barrack Square, Riverside Dr, Perth WA 6000, Australia',
    points: 100,
    description: 'A striking copper-and-glass spire on the foreshore housing the historic Swan Bells. Ring a bell, then soak up the river views.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 150,
    isMajorDestination: true
  },
  {
    id: 'wa_fremantle_prison',
    name: 'Fremantle Prison',
    category: 'scenic',
    coordinates: { latitude: -32.054983799999995, longitude: 115.7536591 },
    address: '1 The Terrace, Fremantle WA 6160, Australia',
    points: 200,
    description: 'A World Heritage-listed convict-era gaol with spine-tingling tunnels and torch-lit night tours. History you can almost touch.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 200
  },
  {
    id: 'wa_cottesloe_beach',
    name: 'Cottesloe Beach',
    category: 'scenic',
    coordinates: { latitude: -31.993862200000002, longitude: 115.7510477 },
    address: 'Cottesloe Beach, Western Australia, Australia',
    points: 100,
    description: 'Perth’s most-loved swimming beach, framed by Norfolk pines and the iconic Indiana teahouse. Golden sand and even better sunsets.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 350
  },
  {
    id: 'wa_scarborough_beach',
    name: 'Scarborough Beach',
    category: 'scenic',
    coordinates: { latitude: -31.893518099999998, longitude: 115.7548947 },
    address: 'Scarborough Beach, Western Australia, Australia',
    points: 100,
    description: 'A lively beachside hub with a buzzing esplanade, surf breaks and an ocean pool. Sun, sand and street-food energy.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 350
  },
  {
    id: 'wa_rottnest_island',
    name: 'Rottnest Island',
    category: 'scenic',
    coordinates: { latitude: -31.996502699999997, longitude: 115.5398997 },
    address: 'Rottnest Island WA 6161, Australia',
    points: 350,
    description: 'A car-free island paradise of secluded bays, snorkelling reefs and the world-famous selfie-loving quokkas. A true bucket-list escape.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 400,
    isMajorDestination: true
  },
  {
    id: 'wa_bibra_lake',
    name: 'Bibra Lake',
    category: 'parks',
    coordinates: { latitude: -32.1071299, longitude: 115.8072672 },
    address: 'Bibra Lake WA 6163, Australia',
    points: 100,
    description: 'A peaceful wetland reserve with a huge adventure playground, shady picnic spots and walk trails alive with birdlife.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 300
  },
  {
    id: 'wa_mandurah_foreshore',
    name: 'Mandurah Foreshore',
    category: 'scenic',
    coordinates: { latitude: -32.5326461, longitude: 115.7191502 },
    address: '17 Mandurah Terrace, Mandurah WA 6210, Australia',
    points: 100,
    description: 'A relaxed canal-city waterfront where dolphins cruise the estuary and the boardwalk hums with cafes and street art.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 1,
    geofenceRadius: 300
  },
  {
    id: 'wa_pinnacles',
    name: 'The Pinnacles Desert',
    category: 'parks',
    coordinates: { latitude: -30.591275000000003, longitude: 115.1581522 },
    address: 'Nambung WA 6521, Australia',
    points: 700,
    description: 'Thousands of eerie limestone spires rising from golden desert sands — an otherworldly moonscape that glows at sunrise and sunset.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 400,
    isMajorDestination: true
  },
  {
    id: 'wa_lancelin_dunes',
    name: 'Lancelin Sand Dunes',
    category: 'scenic',
    coordinates: { latitude: -31.0020631, longitude: 115.3307129 },
    address: 'Beacon Rd, Lancelin WA 6044, Australia',
    points: 350,
    description: 'Towering white sand dunes perfect for sandboarding and 4WD adventures, with a sleepy fishing town and turquoise bays nearby.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 350
  },
  {
    id: 'wa_kalbarri_natures_window',
    name: 'Nature\'s Window',
    category: 'parks',
    coordinates: { latitude: -27.553136499999997, longitude: 114.44599269999999 },
    address: 'Kalbarri National Park WA 6536, Australia',
    points: 700,
    description: 'A natural rock arch perfectly framing the winding Murchison River gorge below. One of WA’s most photographed wonders.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 300,
    isMajorDestination: true
  },
  {
    id: 'wa_kalbarri_skywalk',
    name: 'Kalbarri Skywalk',
    category: 'scenic',
    coordinates: { latitude: -27.554840600000002, longitude: 114.43397089999999 },
    address: 'West Loop Lookout Road, Kalbarri National Park WA 6536, Australia',
    points: 700,
    description: 'Twin cantilevered platforms jutting out over the Murchison Gorge, leaving you suspended 100 metres above the valley floor.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 250
  },
  {
    id: 'wa_geraldton_hmas_sydney',
    name: 'HMAS Sydney II Memorial',
    category: 'scenic',
    coordinates: { latitude: -28.773215, longitude: 114.6160051 },
    address: 'Gummer Ave, Geraldton WA 6530, Australia',
    points: 200,
    description: 'A moving hilltop memorial of soaring silver gulls honouring the lost crew of HMAS Sydney, with sweeping views over the port city.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 200
  },
  {
    id: 'wa_turquoise_bay',
    name: 'Turquoise Bay',
    category: 'scenic',
    coordinates: { latitude: -22.0978565, longitude: 113.8881097 },
    address: 'Turquoise Bay, Cape Range National Park WA 6707, Australia',
    points: 1300,
    description: 'A dazzling stretch of white sand where you can snorkel straight off the beach onto the vibrant coral of Ningaloo Reef.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 350
  },
  {
    id: 'wa_cape_range_np',
    name: 'Cape Range National Park',
    category: 'parks',
    coordinates: { latitude: -22.236679799999997, longitude: 113.84652870000001 },
    address: 'Cape Range National Park WA 6707, Australia',
    points: 1300,
    description: 'Rugged limestone gorges meet the turquoise Ningaloo coast — home to red kangaroos, deep canyons and reef-fringed beaches.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 400
  },
  {
    id: 'wa_exmouth_ningaloo',
    name: 'Ningaloo Reef',
    category: 'scenic',
    coordinates: { latitude: -22.644441399999998, longitude: 113.6402804 },
    address: 'Western Australia, Australia',
    points: 1300,
    description: 'A pristine fringing reef where you can swim with whale sharks, manta rays and turtles just metres from shore.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 400
  },
  {
    id: 'wa_monkey_mia',
    name: 'Monkey Mia',
    category: 'scenic',
    coordinates: { latitude: -25.7953126, longitude: 113.71665349999999 },
    address: 'Monkey Mia, WA 6537, Australia',
    points: 700,
    description: 'A World Heritage beach famous for its wild bottlenose dolphins that glide into the shallows to greet visitors each morning.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 350
  },
  {
    id: 'wa_shell_beach',
    name: 'Shell Beach',
    category: 'scenic',
    coordinates: { latitude: -26.215, longitude: 113.7736111 },
    address: 'Shell Beach, Western Australia 6537, Australia',
    points: 700,
    description: 'A surreal beach made entirely of billions of tiny white cockle shells, stretching for kilometres along a brilliant blue bay.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 350
  },
  {
    id: 'wa_busselton_jetty',
    name: 'Busselton Jetty',
    category: 'scenic',
    coordinates: { latitude: -33.644531199999996, longitude: 115.34503509999999 },
    address: '17 Foreshore Parade, Busselton WA 6280, Australia',
    points: 200,
    description: 'The longest timber-piled jetty in the Southern Hemisphere, stretching 1.8km to an underwater observatory amid the coral.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 300
  },
  {
    id: 'wa_cape_leeuwin',
    name: 'Cape Leeuwin Lighthouse',
    category: 'scenic',
    coordinates: { latitude: -34.3749541, longitude: 115.1363477 },
    address: 'Leeuwin Rd, Augusta WA 6290, Australia',
    points: 700,
    description: 'WA’s tallest lighthouse stands where the Indian and Southern Oceans collide — a dramatic, wind-whipped edge of the continent.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 300,
    isMajorDestination: true
  },
  {
    id: 'wa_mammoth_cave',
    name: 'Mammoth Cave',
    category: 'parks',
    coordinates: { latitude: -34.060037, longitude: 115.02967710000001 },
    address: 'Caves Rd, Forest Grove WA 6286, Australia',
    points: 350,
    description: 'A vast underground chamber draped in ancient stalactites and fossils, explored on a self-guided boardwalk through the dark.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 200
  },
  {
    id: 'wa_margaret_river',
    name: 'Margaret River',
    category: 'food',
    coordinates: { latitude: -33.9535468, longitude: 115.0629667 },
    address: 'Margaret River WA 6285, Australia',
    points: 200,
    description: 'The gourmet heart of WA’s wine country, packed with cellar doors, breweries, chocolate factories and farm-gate produce.',
    imageUrls: [
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 250
  },
  {
    id: 'wa_the_gap_albany',
    name: 'The Gap',
    category: 'scenic',
    coordinates: { latitude: -35.1184965, longitude: 117.89235930000001 },
    address: 'The Gap Rd, Torndirrup WA 6330, Australia',
    points: 700,
    description: 'A sky-bridge platform juts over a churning chasm where the Southern Ocean explodes against towering granite cliffs.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 250
  },
  {
    id: 'wa_middleton_beach',
    name: 'Middleton Beach',
    category: 'scenic',
    coordinates: { latitude: -35.022841199999995, longitude: 117.90885440000001 },
    address: 'Middleton Beach WA 6330, Australia',
    points: 200,
    description: 'A gorgeous crescent of white sand and calm clear water, with a buzzing boardwalk of cafes right behind the dunes.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 2,
    geofenceRadius: 300
  },
  {
    id: 'wa_whale_world_albany',
    name: 'Albany\'s Historic Whaling Station',
    category: 'scenic',
    coordinates: { latitude: -35.0952775, longitude: 117.9594063 },
    address: '81 Whaling Station Rd, Torndirrup WA 6330, Australia',
    points: 350,
    description: 'The last operating whaling station in the country, now a fascinating museum where you can clamber aboard a real whale chaser.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 250
  },
  {
    id: 'wa_lucky_bay',
    name: 'Lucky Bay',
    category: 'scenic',
    coordinates: { latitude: -33.9882318, longitude: 122.2315877 },
    address: 'Lucky Bay, Lucky Bay Rd, Cape Le Grand WA 6450, Australia',
    points: 1300,
    description: 'Squeaky-white sand, electric-blue water and kangaroos lazing on the beach — routinely voted Australia’s whitest sand.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 400,
    isMajorDestination: true
  },
  {
    id: 'wa_cape_le_grand',
    name: 'Cape Le Grand National Park',
    category: 'parks',
    coordinates: { latitude: -33.924932999999996, longitude: 122.1958746 },
    address: 'Cape Le Grand Rd, Cape Le Grand WA 6450, Australia',
    points: 1300,
    description: 'A coastal wonderland of granite peaks, sweeping bays and turquoise water — hike Frenchman Peak for a jaw-dropping panorama.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 400
  },
  {
    id: 'wa_wave_rock',
    name: 'Wave Rock',
    category: 'scenic',
    coordinates: { latitude: -32.441925499999996, longitude: 118.8970171 },
    address: '1 Wave Rock Rd, Hyden WA 6359, Australia',
    points: 700,
    description: 'A 15-metre granite wall curled into a perfect breaking wave, streaked with mineral colours and 2.7 billion years old.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 4,
    geofenceRadius: 350,
    isMajorDestination: true
  },
  {
    id: 'wa_super_pit_lookout',
    name: 'KCGM Super Pit Lookout',
    category: 'scenic',
    coordinates: { latitude: -30.792246399999996, longitude: 121.50529619999999 },
    address: 'Mount Monger Rd, Trafalgar WA 6431, Australia',
    points: 350,
    description: 'Peer into one of the largest open-cut gold mines on Earth, where giant haul trucks look like ants on the terraced walls.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 3,
    geofenceRadius: 200
  },
  {
    id: 'wa_karijini_np',
    name: 'Karijini National Park',
    category: 'parks',
    coordinates: { latitude: -22.6751716, longitude: 118.2889234 },
    address: 'Karijini WA 6751, Australia',
    points: 2300,
    description: 'A breathtaking maze of deep red gorges, hidden waterfalls and spa-like rock pools carved over billions of years in the Pilbara.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 6,
    geofenceRadius: 400
  },
  {
    id: 'wa_karijini_fortescue',
    name: 'Fortescue Falls',
    category: 'parks',
    coordinates: { latitude: -22.4777579, longitude: 118.5506552 },
    address: 'Dales Rd, Karijini WA 6751, Australia',
    points: 2300,
    description: 'A tiered waterfall tumbling into an emerald plunge pool deep within Dales Gorge — a reward at the end of the descent.',
    imageUrls: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 6,
    geofenceRadius: 300
  },
  {
    id: 'wa_cable_beach',
    name: 'Cable Beach',
    category: 'scenic',
    coordinates: { latitude: -17.9319444, longitude: 122.20805559999998 },
    address: 'Cable Beach, WA 6726, Australia',
    points: 1300,
    description: '22 kilometres of pearl-white sand meeting the Indian Ocean, famous for camel trains silhouetted against fiery tropical sunsets.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 400,
    isMajorDestination: true
  },
  {
    id: 'wa_gantheaume_point',
    name: 'Gantheaume Point',
    category: 'scenic',
    coordinates: { latitude: -17.9738748, longitude: 122.17745679999999 },
    address: 'Gantheaume Point Rd, Broome WA 6725, Australia',
    points: 1300,
    description: 'Fiery red sandstone cliffs plunging into turquoise sea, where 130-million-year-old dinosaur footprints appear at low tide.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: [],
    createdAt: '2026-06-21T00:00:00Z',
    tier: 5,
    geofenceRadius: 300
  },
];

// Offline Queue Database Interfaces for SQLite
interface SQLiteQueueItem {
  id: string;
  locationId: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  points: number;
}

// In-Memory Fallback State (e.g. for Web / Development)
class StorageManager {
  private user: User | null = null;
  private checkIns: CheckIn[] = [];
  // Achievement CATALOGUE (definitions) — bundled fallback, replaced by the live
  // /api/achievements list once fetched. Unlock state is tracked separately.
  private achievementDefs: AchievementDef[] = ACHIEVEMENTS_CATALOGUE;
  private unlocked: Record<string, string> = {}; // achievement id -> unlockedAt ISO
  private newAchievements: Set<string> = new Set(); // unlocked this session (for the NEW badge)
  private achievementsFetched = false;
  private locations: ExploreLocation[] = INITIAL_LOCATIONS;
  private offlineQueue: SQLiteQueueItem[] = [];
  // Hidden/locked spots the user has UNLOCKED by physically reaching them (within
  // CHECK_IN_RADIUS_M). Once unlocked a spot stays on their map permanently, even
  // before they check in. Persisted as a JSON array of location ids.
  private unlockedLocationIds: Set<string> = new Set();
  private db: any = null;

  constructor() {
    this.initDatabase();
    this.loadState();
  }

  private async initDatabase() {
    if (Platform.OS === 'web') return;

    try {
      const SQLiteModule = require('expo-sqlite');
      this.db = SQLiteModule.openDatabaseSync('locatour.db');
      
      // Initialize tables
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS offline_queue (
          id TEXT PRIMARY KEY NOT NULL,
          locationId TEXT NOT NULL,
          photoUrl TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          timestamp TEXT NOT NULL,
          points INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      console.log('SQLite database initialized successfully');
    } catch (e) {
      console.error('Failed to initialize SQLite, falling back to local memory queue', e);
    }
  }

  // Read one persisted value. Web → localStorage; native → the SQLite kv table
  // (there is no window.localStorage in React Native).
  private readKey(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    if (this.db) {
      const row = this.db.getFirstSync('SELECT value FROM kv WHERE key = ?', [key]) as
        | { value: string }
        | null;
      return row ? row.value : null;
    }
    return null;
  }

  private writeKey(key: string, value: string) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
      return;
    }
    if (this.db) {
      this.db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  private loadState() {
    try {
      const storedUser = this.readKey('locatour_user');
      const storedCheckins = this.readKey('locatour_checkins');
      const storedUnlocked = this.readKey('locatour_ach_unlocked');
      const storedUnlockedLocs = this.readKey('locatour_unlocked_locations');
      const storedQueue = this.readKey('locatour_queue');

      if (storedUser) {
        this.user = JSON.parse(storedUser);
        // Re-derive level fields from totalXP via leveling.ts so any user saved
        // under the old hand-rolled formula is corrected on load (spec 06).
        if (this.user) {
          Object.assign(this.user.stats, deriveLevelStats(this.user.stats.totalXP));
        }
      }
      if (storedCheckins) this.checkIns = JSON.parse(storedCheckins);
      if (storedUnlocked) this.unlocked = JSON.parse(storedUnlocked) || {};
      if (storedUnlockedLocs) this.unlockedLocationIds = new Set(JSON.parse(storedUnlockedLocs) || []);
      if (storedQueue) this.offlineQueue = JSON.parse(storedQueue);

      // Hydrate the last good API location result (if any) so an offline launch
      // shows real locations before getLocations() runs. Stays the bundled mock
      // otherwise. getLocations() will still try the live API on first call.
      const cachedLocations = this.readCachedLocations();
      if (cachedLocations) this.locations = cachedLocations;
    } catch (e) {
      console.error('Failed to load storage state', e);
    }
  }

  private saveState() {
    try {
      if (this.user) this.writeKey('locatour_user', JSON.stringify(this.user));
      this.writeKey('locatour_checkins', JSON.stringify(this.checkIns));
      this.writeKey('locatour_unlocked_locations', JSON.stringify([...this.unlockedLocationIds]));
      this.writeKey('locatour_queue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.error('Failed to save storage state', e);
    }
  }

  // --- Profile Operations ---
  public async getUser(): Promise<User | null> {
    return this.user;
  }

  /**
   * Synchronous read of the in-memory profile (already loaded at app start).
   * Lets a screen seed its first render — e.g. the map's initial region from the
   * user's base coordinates — without awaiting. Null before load completes.
   */
  public getCachedUser(): User | null {
    return this.user;
  }

  // --- Unlocked-location Operations ---
  // A spot becomes "unlocked" the moment the user physically reaches it (within
  // CHECK_IN_RADIUS_M). It then stays on their map forever, even before they
  // check in. Distinct from a check-in (which earns points via a photo).
  public getUnlockedLocationIds(): string[] {
    return [...this.unlockedLocationIds];
  }

  public isLocationUnlocked(id: string): boolean {
    return this.unlockedLocationIds.has(id);
  }

  /** Mark a spot unlocked + persist. Returns true if this was a NEW unlock. */
  public unlockLocation(id: string): boolean {
    if (this.unlockedLocationIds.has(id)) return false;
    this.unlockedLocationIds.add(id);
    this.writeKey('locatour_unlocked_locations', JSON.stringify([...this.unlockedLocationIds]));
    return true;
  }

  // --- Nearby-alerts (background geofence notifications) opt-in ---
  // Off by default (store-friendly: we never request "all the time" location
  // until the user deliberately enables this). Also gates the explorer point
  // multiplier, as an incentive to turn it on.
  public getNearbyAlertsEnabled(): boolean {
    try {
      return this.readKey('locatour_nearby_alerts') === '1';
    } catch {
      return false;
    }
  }

  public setNearbyAlertsEnabled(enabled: boolean): void {
    this.writeKey('locatour_nearby_alerts', enabled ? '1' : '0');
  }

  public async setUser(user: User): Promise<void> {
    this.user = user;
    this.saveState();
  }

  /**
   * Sign out: drop the in-memory profile and clear the persisted user so the app
   * returns to the auth flow. Check-in history stays on the device (mock auth —
   * there's no server account to sync back to).
   */
  public async logout(): Promise<void> {
    this.user = null;
    this.writeKey('locatour_user', '');
  }

  public async updateProfile(displayName: string, username: string, bio: string, avatarUrl: string, interests?: string[], homeCoordinates?: Coordinates): Promise<User | null> {
    if (!this.user) return null;
    this.user = {
      ...this.user,
      displayName,
      username: username.startsWith('@') ? username : `@${username}`,
      bio,
      avatarUrl,
      ...(interests ? { interests } : {}),
      ...(homeCoordinates ? { homeCoordinates } : {}),
    };
    this.saveState();
    return this.user;
  }

  public async customizeInterests(gender: string, homeSuburb: string, interests: string[], homeCoordinates?: Coordinates): Promise<User | null> {
    if (!this.user) {
      // Create empty profile template if not authenticated yet
      this.user = {
        uid: 'user_' + Math.random().toString(36).substr(2, 9),
        displayName: 'New Explorer',
        username: '@explorer',
        bio: '',
        avatarUrl: 'https://api.dicebear.com/7.x/adventurer/png?seed=Explorer&backgroundColor=c0aede',
        gender,
        homeSuburb,
        ...(homeCoordinates ? { homeCoordinates } : {}),
        interests,
        stats: {
          dayStreak: 0,
          totalXP: 0,
          uniqueLocations: 0,
          totalCheckIns: 0,
          // Level fields derived from totalXP via the OSRS curve (leveling.ts)
          // so a fresh profile already reads xpNeededForNextLevel = 83 (L1→L2).
          ...deriveLevelStats(0),
        },
        createdAt: new Date().toISOString()
      };
    } else {
      this.user = {
        ...this.user,
        gender,
        homeSuburb,
        ...(homeCoordinates ? { homeCoordinates } : {}),
        interests
      };
    }
    this.saveState();
    return this.user;
  }

  // --- Location Operations ---
  // Whether the live API has already been queried this session (so repeated
  // screen mounts reuse the in-memory list instead of re-fetching every time).
  private locationsFetched = false;

  // Map one raw API location object → ExploreLocation. The API wraps points/tier
  // under the rich-locations spec (06); we coerce defensively because the mock
  // fallback must stay shape-compatible with whatever the backend ships.
  private mapApiLocation(raw: any): ExploreLocation {
    const tier = Number(raw.tier);
    return {
      id: String(raw.id),
      name: raw.name ?? '',
      category: (raw.category ?? 'parks') as ExploreLocation['category'],
      coordinates: {
        latitude: Number(raw.coordinates?.latitude ?? raw.latitude ?? 0),
        longitude: Number(raw.coordinates?.longitude ?? raw.longitude ?? 0),
      },
      address: raw.address ?? '',
      points: Number(raw.points ?? 0),
      description: raw.description ?? '',
      imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : [],
      verificationTags: Array.isArray(raw.verificationTags) ? raw.verificationTags : [],
      createdAt: raw.createdAt ?? new Date().toISOString(),
      tier: Number.isFinite(tier) && tier >= 1 ? tier : 1,
      tags: Array.isArray(raw.tags) ? raw.tags : undefined,
      categories: Array.isArray(raw.categories) ? raw.categories : undefined,
      geofenceRadius:
        raw.geofenceRadius != null
          ? Number(raw.geofenceRadius)
          : raw.geofence_radius_m != null
            ? Number(raw.geofence_radius_m)
            : undefined,
      isMajorDestination: Boolean(raw.isMajorDestination ?? raw.is_major_destination ?? false),
    };
  }

  // Best-effort fetch of the live locations from the Laravel API. Resolves to a
  // mapped list, or null on any failure/timeout/offline so the caller falls back
  // to the bundled mock. The last good API result is cached in the kv store and
  // hydrated into `this.locations` on construction.
  // Try each candidate API base URL in turn (LAN IP for a phone, 10.0.2.2 for the
  // Android emulator); return the first JSON body, or null if none respond.
  private async fetchFromApi(path: string): Promise<any | null> {
    // Attach the account's bearer token when we have one so the server can
    // attribute the request (rate-limit + scrape-detection are per-account).
    // The locations API is still publicly readable for now, so a missing token
    // is fine — it just can't be attributed.
    const token = this.getToken();
    for (const base of API_URLS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const res = await fetch(`${base}${path}`, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) return await res.json();
      } catch (e) {
        // Timeout / offline / DNS / refused — fall through to the next candidate.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  private async fetchRemoteLocations(
    opts?: { latitude?: number; longitude?: number; level?: number },
  ): Promise<ExploreLocation[] | null> {
    // When we know where the user is, ask the server for ONLY their slice —
    // tier-relevant spots within the reach radius (+ always-visible majors) —
    // so the phone never downloads the whole ~1000-spot catalogue.
    let path = '/api/locations';
    if (opts?.latitude != null && opts?.longitude != null) {
      let q = `?lat=${encodeURIComponent(String(opts.latitude))}&lng=${encodeURIComponent(
        String(opts.longitude),
      )}&radius=${REACH_RADIUS_M}`;
      if (opts.level != null) q += `&level=${opts.level}`;
      path += q;
    }
    const body = await this.fetchFromApi(path);
    if (!body) return null;
    // The API response may be wrapped as { data: [...] } (Laravel resources).
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
    if (!list) return null;
    const mapped = list.map((raw: any) => this.mapApiLocation(raw));
    if (mapped.length === 0) return null;
    // Cache the last good API result so a later offline launch still shows
    // real locations rather than only the bundled mock.
    this.writeKey('locatour_locations_cache', JSON.stringify(mapped));
    return mapped;
  }

  /**
   * Returns the locations to show. Pass the user's {latitude, longitude, level}
   * to (re-)sync the local slice from the server — call this on app reopen and
   * after a tier-up so a new city / new tier pulls fresh spots. Without a
   * location we don't fetch the whole catalogue: we serve the in-memory session
   * list, then the last cached slice, then the bundled offline sample.
   */
  public async getLocations(
    opts?: { latitude?: number; longitude?: number; level?: number },
  ): Promise<ExploreLocation[]> {
    // Located (re-)sync: always fetch a fresh slice when we have coordinates.
    if (opts?.latitude != null && opts?.longitude != null) {
      const remote = await this.fetchRemoteLocations(opts);
      if (remote) {
        this.locations = remote;
        this.locationsFetched = true;
        return this.locations;
      }
      // Fetch failed (offline) → fall through to cache/bundled below.
    }

    // No coordinates yet (or the located fetch failed): reuse what we have
    // rather than pulling the full catalogue.
    if (this.locationsFetched) return this.locations;
    const cached = this.readCachedLocations();
    this.locations = cached ?? INITIAL_LOCATIONS;
    this.locationsFetched = true;
    return this.locations;
  }

  // Read the last good API result from the kv cache, or null if absent/corrupt.
  private readCachedLocations(): ExploreLocation[] | null {
    try {
      const raw = this.readKey('locatour_locations_cache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  public async getLocationById(id: string): Promise<ExploreLocation | undefined> {
    // Ensure the list has been resolved (API/cache/mock) before looking up.
    if (!this.locationsFetched) await this.getLocations();
    return this.locations.find(loc => loc.id === id);
  }

  // Whether the user may check in to this location right now: true unless their
  // most recent check-in there was within CHECKIN_COOLDOWN_H hours (spec 06).
  public async canCheckIn(locationId: string): Promise<boolean> {
    return this.nextCheckInAt(locationId) === null;
  }

  // The Date the location becomes checkable-in again, or null if it already is.
  // Considers both synced check-ins and the offline queue so a just-queued
  // offline check-in still enforces the cooldown.
  public nextCheckInAt(locationId: string): Date | null {
    const timestamps = this.checkIns
      .filter(c => c.locationId === locationId)
      .map(c => new Date(c.timestamp).getTime());
    for (const item of this.offlineQueue) {
      if (item.locationId === locationId) timestamps.push(new Date(item.timestamp).getTime());
    }
    if (timestamps.length === 0) return null;
    const latest = Math.max(...timestamps);
    const readyAt = latest + CHECKIN_COOLDOWN_H * 60 * 60 * 1000;
    return readyAt > Date.now() ? new Date(readyAt) : null;
  }

  // --- Check-In Operations & Gamification ---
  public async getCheckIns(): Promise<CheckIn[]> {
    return this.checkIns;
  }

  public async addCheckIn(checkIn: CheckIn): Promise<void> {
    // Tier-gating invariant (backstop for any caller): SECRET locations (beyond
    // the hidden discovery range) can never be checked into. Hidden spots within
    // range ARE allowed — that's a discovery. The camera UI also pre-checks.
    const target = this.locations.find((l) => l.id === checkIn.locationId);
    if (this.user && target && target.tier > maxDiscoverableTier(this.user.stats.currentLevel)) {
      throw new Error(`${target.name} is locked.`);
    }

    this.checkIns.push(checkIn);

    // Update user statistics and achievements
    if (this.user) {
      const stats = { ...this.user.stats };
      stats.totalCheckIns += 1;
      
      const uniqueLocIds = new Set(this.checkIns.map(c => c.locationId));
      stats.uniqueLocations = uniqueLocIds.size;

      // Experience Points Math — award the location's points to cumulative XP,
      // then recompute level/progress from totalXP via the authentic OSRS curve
      // (leveling.ts is the single source of truth). Achievement XP is added
      // later in evaluateAchievements, which re-derives these fields again.
      const xpGained = checkIn.pointsEarned;
      stats.totalXP += xpGained;
      Object.assign(stats, deriveLevelStats(stats.totalXP));

      // Check Streaks (simple date diff)
      // Check if last check-in was yesterday, same day, or more
      if (this.checkIns.length > 1) {
        const lastCheckIn = this.checkIns[this.checkIns.length - 2];
        const lastDate = new Date(lastCheckIn.timestamp).toDateString();
        const currentDate = new Date(checkIn.timestamp).toDateString();
        
        if (lastDate !== currentDate) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (lastDate === yesterday.toDateString()) {
            stats.dayStreak += 1;
          } else {
            stats.dayStreak = 1;
          }
        }
      } else {
        stats.dayStreak = 1;
      }

      this.user.stats = stats;

      // Re-evaluate the achievement catalogue against the updated stats.
      this.evaluateAchievements();
    }

    this.saveState();
  }

  // Best-effort fetch of the live achievement catalogue (falls back to the
  // bundled ACHIEVEMENTS_CATALOGUE on any failure/timeout/offline).
  private async fetchRemoteAchievements(): Promise<AchievementDef[] | null> {
    const body = await this.fetchFromApi('/api/achievements');
    if (!body) return null;
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
    if (!list || list.length === 0) return null;
    return list.map((r: any): AchievementDef => ({
      id: String(r.id),
      title: r.title ?? '',
      description: r.description ?? '',
      difficulty: (r.difficulty ?? 'Medium') as Achievement['difficulty'],
      category: r.category ?? undefined,
      metric: r.metric ?? 'total_checkins',
      threshold: Number(r.threshold ?? 1),
      points: Number(r.points ?? 0),
      iconName: r.iconName ?? r.icon_name ?? 'trophy-outline',
    }));
  }

  // Compute every metric an achievement rule can reference, from the user's
  // current stats + check-ins (+ resolved locations for tier/category).
  private computeMetrics(): Record<string, number> {
    const stats = this.user?.stats;
    const locById = new Map(this.locations.map((l) => [l.id, l]));

    const byDay: Record<string, number> = {};
    let maxInDay = 0;
    let parks = 0, scenic = 0, food = 0, maxTier = 0;
    const cats = new Set<string>();

    for (const c of this.checkIns) {
      const day = new Date(c.timestamp).toDateString();
      byDay[day] = (byDay[day] || 0) + 1;
      if (byDay[day] > maxInDay) maxInDay = byDay[day];

      const loc = locById.get(c.locationId);
      if (!loc) continue;
      cats.add(loc.category);
      if (loc.category === 'parks') parks++;
      else if (loc.category === 'scenic') scenic++;
      else if (loc.category === 'food') food++;
      if ((loc.tier || 1) > maxTier) maxTier = loc.tier || 1;
    }

    return {
      total_checkins: stats?.totalCheckIns ?? this.checkIns.length,
      unique_locations: stats?.uniqueLocations ?? new Set(this.checkIns.map((c) => c.locationId)).size,
      day_streak: stats?.dayStreak ?? 0,
      total_xp: stats?.totalXP ?? 0,
      level: stats?.currentLevel ?? 1,
      tier_reached: maxTier,
      distinct_categories: cats.size,
      checkins_in_day: maxInDay,
      category_checkins_parks: parks,
      category_checkins_scenic: scenic,
      category_checkins_food: food,
    };
  }

  // Award any not-yet-unlocked achievement whose metric meets its threshold.
  // Achievements are BADGES — they do NOT add to XP (dozens can unlock at once,
  // which would wreck the level curve); `points` is a prestige score on the card.
  private evaluateAchievements(): void {
    const metrics = this.computeMetrics();
    let dirty = false;

    for (const def of this.achievementDefs) {
      if (this.unlocked[def.id]) continue;
      if ((metrics[def.metric] ?? 0) >= def.threshold) {
        this.unlocked[def.id] = new Date().toISOString();
        this.newAchievements.add(def.id);
        dirty = true;
      }
    }

    if (dirty) this.writeKey('locatour_ach_unlocked', JSON.stringify(this.unlocked));
  }

  // The full catalogue (live or bundled) merged with the user's unlock state.
  public async getAchievements(): Promise<Achievement[]> {
    if (!this.achievementsFetched) {
      const remote = await this.fetchRemoteAchievements();
      if (remote && remote.length) this.achievementDefs = remote;
      this.achievementsFetched = true;
      // Make sure already-satisfied achievements show as unlocked on first view.
      this.evaluateAchievements();
    }

    return this.achievementDefs.map((def) => ({
      ...def,
      isUnlocked: !!this.unlocked[def.id],
      unlockedAt: this.unlocked[def.id],
      isNew: this.newAchievements.has(def.id),
    }));
  }

  public async acknowledgeNewAchievements(): Promise<void> {
    this.newAchievements.clear();
  }

  // --- SQLite Offline Queue Operations ---
  public async queueOfflineCheckIn(locationId: string, photoUrl: string, coordinates: Coordinates, points: number): Promise<void> {
    const item: SQLiteQueueItem = {
      id: 'offline_' + Math.random().toString(36).substr(2, 9),
      locationId,
      photoUrl,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timestamp: new Date().toISOString(),
      points
    };

    if (Platform.OS === 'web' || !this.db) {
      this.offlineQueue.push(item);
      this.saveState();
      console.log('Queued offline checkin in localStorage:', item);
      return;
    }

    try {
      this.db.runSync(`
        INSERT INTO offline_queue (id, locationId, photoUrl, latitude, longitude, timestamp, points)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `, [item.id, item.locationId, item.photoUrl, item.latitude, item.longitude, item.timestamp, item.points]);
      console.log('SQLite: Queued offline checkin:', item);
    } catch (e) {
      console.error('Failed to run insert in SQLite, queueing in memory', e);
      this.offlineQueue.push(item);
      this.saveState();
    }
  }

  public async getQueuedCheckIns(): Promise<CheckIn[]> {
    if (Platform.OS === 'web' || !this.db) {
      return this.offlineQueue.map(item => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    }

    try {
      const rows = this.db.getAllSync('SELECT * FROM offline_queue;');
      return rows.map((item: any) => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    } catch (e) {
      console.error('Failed to fetch from SQLite queue, using memory fallback', e);
      return this.offlineQueue.map(item => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    }
  }

  // --- Account token (Sanctum) ---
  // The bearer token is persisted in the same kv store as the rest of the
  // profile so it survives app restarts. getToken/setToken are the only public
  // surface account.ts needs; readKey/writeKey stay private.
  public getToken(): string | null {
    const t = this.readKey('locatour_token');
    return t && t.length > 0 ? t : null;
  }

  public setToken(token: string): void {
    this.writeKey('locatour_token', token);
  }

  // --- Pending check-in uploads (retry queue) ---
  // The offline_queue table is the source of truth for check-ins that still need
  // to be uploaded to the server. getQueuedUploads returns each row with its id
  // (for per-item removal after a confirmed upload) and a PendingUpload payload
  // enriched with the location name resolved from the in-memory location list.
  public async getQueuedUploads(): Promise<
    { id: string; payload: import('./account').PendingUpload }[]
  > {
    const rows: SQLiteQueueItem[] =
      Platform.OS === 'web' || !this.db
        ? this.offlineQueue
        : (() => {
            try {
              return this.db.getAllSync('SELECT * FROM offline_queue;') as SQLiteQueueItem[];
            } catch (e) {
              console.error('Failed to read offline_queue for upload', e);
              return this.offlineQueue;
            }
          })();

    return rows.map((item) => {
      const loc = this.locations.find((l) => l.id === item.locationId);
      return {
        id: item.id,
        payload: {
          locationId: item.locationId,
          locationName: loc?.name ?? null,
          photoUri: item.photoUrl,
          pointsEarned: item.points,
          latitude: item.latitude,
          longitude: item.longitude,
          verifiedOffline: true,
          checkedInAt: item.timestamp,
        },
      };
    });
  }

  // Remove one queued upload by id after it has been confirmed uploaded.
  public async removeQueuedUpload(id: string): Promise<void> {
    if (Platform.OS === 'web' || !this.db) {
      this.offlineQueue = this.offlineQueue.filter((i) => i.id !== id);
      this.saveState();
      return;
    }
    try {
      this.db.runSync('DELETE FROM offline_queue WHERE id = ?;', [id]);
    } catch (e) {
      console.error('Failed to delete queued upload, falling back to memory', e);
      this.offlineQueue = this.offlineQueue.filter((i) => i.id !== id);
      this.saveState();
    }
  }

  public async clearQueue(): Promise<void> {
    if (Platform.OS === 'web' || !this.db) {
      this.offlineQueue = [];
      this.saveState();
      return;
    }

    try {
      this.db.runSync('DELETE FROM offline_queue;');
      console.log('SQLite queue cleared successfully');
    } catch (e) {
      console.error('Failed to clear SQLite queue, clearing memory fallback', e);
      this.offlineQueue = [];
      this.saveState();
    }
  }
}

export const storage = new StorageManager();
