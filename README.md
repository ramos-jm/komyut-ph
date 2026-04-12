# PH Commute Guide

Route-based commuting assistant for the Philippines.

## What this MVP solves

This app answers: **"Ano ang sasakyan ko from Point A to Point B?"**

- No real-time GPS tracking
- No schedule-based jeepney/bus computation
- Uses signboard-based instructions
- Uses free APIs and free-tier hosting

## Monorepo structure

```text
jeyem/
  backend/
    src/
      config/
      controllers/
      db/
      middleware/
      repositories/
      routes/
      services/
      utils/
    package.json
    .env.example
  frontend/
    src/
      components/
      lib/
      styles/
    index.html
    package.json
    vite.config.js
    tailwind.config.js
  db/
    schema.sql
    seed.sql
  .gitignore
  README.md
```

## Stack

- Frontend: React (Vite), Tailwind CSS, MapLibre GL JS
- Backend: Node.js + Express
- Database: PostgreSQL + PostGIS
- Geocoding: Nominatim (cached)
- Base map data: OpenStreetMap tiles/styles

## Backend API

Base URL: `http://localhost:4000/api`

- `GET /search-route?origin=...&destination=...`
- `GET /stops/nearby?lat=...&lng=...&radius=1000`
- `GET /routes/:id`
- `POST /save-route`
- `GET /saved-routes`
- `GET /train-info`

## Example `GET /search-route`

```json
{
  "origin": {
    "text": "Recto Manila",
    "latitude": 14.6031,
    "longitude": 120.9851,
    "source": "cache"
  },
  "destination": {
    "text": "Cubao QC",
    "latitude": 14.619,
    "longitude": 121.0537,
    "source": "nominatim"
  },
  "routes": [
    {
      "type": "fastest",
      "estimatedMinutes": 38,
      "estimatedFare": 13,
      "transfers": 0,
      "steps": [
        {
          "mode": "walk",
          "instruction": "Maglakad ng humigit-kumulang 5 minuto papunta sa Recto."
        },
        {
          "mode": "jeep",
          "signboard": "Cubao-Divisoria",
          "instruction": "Sakay ng jeep na may signboard na \"Cubao-Divisoria\" mula Recto hanggang Cubao.",
          "from": "Recto",
          "to": "Cubao"
        },
        {
          "mode": "walk",
          "instruction": "Maglakad ng humigit-kumulang 3 minuto papunta sa destinasyon."
        }
      ],
      "pathCoordinates": [
        [120.9851, 14.6031],
        [121.0537, 14.619]
      ]
    }
  ],
  "meta": {
    "candidateCount": 3,
    "searchedStops": {
      "origin": 8,
      "destination": 6
    }
  }
}
```

## Routing logic (BFS)

1. Geocode origin/destination using Nominatim
2. Find nearest stops within radius (default 1000m)
3. Build transit graph from `route_stops` + `routes`
4. BFS traversal over stops with max 2 transfers
5. Score candidates:
   - fastest (estimated minutes)
   - least transfers
   - cheapest (rough fare)

## Database setup

1. Create database, then enable PostGIS.
2. Run one command from `backend/`:

```bash
npm run db:setup
```

Or with `psql`:

```bash
psql -d ph_commute_guide -f db/schema.sql
psql -d ph_commute_guide -f db/seed.sql
```

### Neon setup (recommended)

1. Create a Neon project and a database named `ph_commute_guide`.
2. Copy the pooled connection string from Neon.
3. In `backend/.env`, set `DATABASE_URL` to the pooled Neon URL.
4. Ensure the URL contains `?sslmode=require`.
5. Open Neon SQL Editor and run:
  - `db/schema.sql`
  - `db/seed.sql`
6. Start backend from `backend/`:

```bash
npm run dev
```

If PostGIS extension creation is blocked on your Neon plan/tier, use Supabase Postgres (free tier) and run the same `db/schema.sql` and `db/seed.sql` scripts there.

## Run locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Update DATABASE_URL in .env
npm run dev
```

### Optional: Import real stops/routes from Overpass

From `backend/`:

```bash
npm run import:overpass
```

Optional args:

```bash
npm run import:overpass -- --bbox "14.35,120.85,14.83,121.20" --limit 300
```

This importer ingests public-transport stops and route relations from Overpass data, then maps them into `stops`, `routes`, and `route_stops`.

### 2. Frontend

```bash
cd frontend
npm install
# Optional: set VITE_API_BASE_URL in .env (defaults to http://localhost:4000/api)
npm run dev
```

## Tests

From `backend/`:

```bash
npm test
```

Included tests:

- BFS routing option selection and instruction shape
- API contract checks for `/health`, `/api/train-info`, and `/api/search-route`

## Free-tier deployment

- Frontend: Vercel
- Backend: Render or Railway
- PostgreSQL: Neon or Supabase (with PostGIS)

## Offline support

- Service worker via `vite-plugin-pwa`
- Cached route search responses
- Cached saved routes responses
- Local fallback in `localStorage` for last search and saved routes

## Notes for production hardening

- Add auth for user-specific saved routes
- Add background job to refresh geocode cache health
- Add richer stop/route dataset (GTFS-like import pipeline from OSM/Overpass)
- Add tests for BFS route ranking and API contracts
