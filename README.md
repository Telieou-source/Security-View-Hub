# Global Threat-Intel CSV Aggregator

A full-stack threat intelligence platform designed for **air-gapped environments**. Manually ingest open-source CSV and plain-text threat feeds, normalize them into a unified indicator database, and explore the data through an interactive dashboard — with no internet dependency at runtime.

![Dashboard](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20PostgreSQL-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Air-Gapped](https://img.shields.io/badge/deployment-air--gapped-orange)

**Live demo:** [https://YOUR-PUBLISHED-URL.replit.app](https://YOUR-PUBLISHED-URL.replit.app)

---

## Features

- **Manual import only** — no auto-fetch or polling; every import is deliberate
- **Three import modes** — paste text, enter a local-network URL, or upload a file
- **Broad format support** — PhishTank, URLhaus, Blocklist.de, MISP, hosts-file, hash lists, `#`-delimited geo formats, and any one-indicator-per-line plain-text file
- **Automatic type detection** — IPs, CIDRs, domains, URLs, MD5/SHA1/SHA256 hashes
- **Offline GeoIP** — country assignment via bundled `geoip-lite` database (no API key needed)
- **IP extraction from URLs** — URLs with bare-IP hostnames (e.g. `http://1.2.3.4/payload`) automatically generate a correlated IP indicator with geo data
- **Indicator correlation** — indicators from the same source row share a `correlation_id`; click any row to see its related indicators in a slide-out panel
- **Interactive dashboard** — world map, indicators-by-type, top-feed-sources, and top-countries charts; click any chart bar to filter the indicator table
- **CSV / JSON export** — download your full dataset or a filtered subset for use in SIEMs, firewalls, or other tools
- **Import & export history** — full audit log of every ingest and export

---

## Screenshots

| Dashboard | Indicators Table | Import |
|-----------|-----------------|--------|
| World map + charts | Filterable, paginated table | URL / Paste / File upload |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, react-simple-maps, wouter |
| Backend | Node.js, Express 5, Drizzle ORM |
| Database | PostgreSQL 13+ |
| GeoIP | geoip-lite (offline database, bundled) |
| Monorepo | pnpm workspaces |
| API client | Orval (OpenAPI → React Query hooks) |

---

## Getting Started (Development)

### Prerequisites

- Node.js v18+
- pnpm v8+
- PostgreSQL 13+

### Install

```bash
git clone https://github.com/your-org/threat-intel.git
cd threat-intel
pnpm install
```

### Configure

```bash
# Set your PostgreSQL connection string
export DATABASE_URL=postgres://postgres:password@localhost:5432/threatintel
export SESSION_SECRET=your-random-secret
```

Or create a `.env` file at the repo root.

### Database setup

```bash
createdb threatintel
cd lib/db && pnpm run push
```

### Run

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend (in a separate terminal)
pnpm --filter @workspace/threat-intel run dev
```

The UI opens at the URL shown in the frontend terminal output.

---

## Air-Gapped Deployment

A single script builds a fully self-contained tarball that only requires Node.js and PostgreSQL on the target machine — no npm, no internet.

```bash
bash scripts/build-dist.sh
```

This produces `threat-intel-dist.tar.gz` (~35–50 MB) containing:

```
threat-intel-dist/
├── server.mjs          ← compiled API server
├── pino-*.mjs          ← logging workers
├── node_modules/
│   └── geoip-lite/     ← offline IP-to-country database
├── public/             ← compiled React UI
├── schema.sql          ← database schema (run once)
├── .env.example
├── start.sh            ← Linux / macOS launcher
├── start.bat           ← Windows launcher
└── README.txt
```

### Deploy on the air-gapped machine

```bash
# 1. Transfer the tarball (USB, internal file share, etc.)
tar -xzf threat-intel-dist.tar.gz
cd threat-intel-dist

# 2. Create and initialise the database (first time only)
createdb threatintel
psql -U postgres -d threatintel -f schema.sql

# 3. Configure
cp .env.example .env
# Edit .env: set DATABASE_URL and SESSION_SECRET

# 4. Start
./start.sh        # Linux / macOS
# start.bat       # Windows

# Open http://localhost:3000
```

---

## Supported Feed Formats

| Format | Example Sources |
|--------|----------------|
| CSV with headers | PhishTank, URLhaus CSV, MISP exports |
| Plain-text, one per line | Blocklist.de, Botvrij.eu, abuse.ch |
| Hosts-file | StevenBlack hosts, Pi-hole lists |
| `#`-delimited geo format | `IP#score#score#Label#CC#City#Lat,Lon#score` |
| Hash lists | MD5 / SHA1 / SHA256, one per line |
| Multi-indicator rows | `IP # domain.com`, `IP domain.com` |
| Dridex / Emotet style | `1.2.3.4 # Dridex - http://evil.com` |
| TSV | Tab-separated variants of any above |

The parser auto-detects the format — no configuration required.

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/          # Express API server
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── csv-ingestion.ts   # Core parser & normalizer
│   │   │   │   └── geoip.ts           # Offline GeoIP wrapper
│   │   │   └── routes/
│   │   │       ├── indicators.ts
│   │   │       ├── stats.ts
│   │   │       ├── history.ts
│   │   │       └── exports.ts
│   │   └── build.mjs                  # esbuild bundler config
│   └── threat-intel/        # React frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx
│           │   ├── indicators.tsx
│           │   ├── import.tsx
│           │   └── export.tsx
│           └── components/
│               └── WorldThreatMap.tsx
├── lib/
│   ├── db/                  # Drizzle ORM schema + client
│   ├── api-zod/             # Zod schemas (generated)
│   └── api-client-react/    # React Query hooks (Orval generated)
└── scripts/
    ├── build-dist.sh        # Air-gapped distribution builder
    └── schema.sql           # Standalone DB schema
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/indicators` | List indicators (paginated, filterable) |
| `POST` | `/api/indicators/import` | Ingest CSV/text content |
| `POST` | `/api/indicators/import-url` | Ingest from URL |
| `GET` | `/api/indicators/:id/related` | Get correlated indicators |
| `DELETE` | `/api/indicators/purge` | Remove all indicators |
| `GET` | `/api/stats` | Summary counts |
| `GET` | `/api/stats/by-type` | Breakdown by indicator type |
| `GET` | `/api/stats/by-country` | Breakdown by country |
| `GET` | `/api/stats/by-feed` | Breakdown by source feed |
| `GET` | `/api/export/csv` | Export as CSV |
| `GET` | `/api/export/json` | Export as JSON |
| `GET` | `/api/history/imports` | Import history |
| `GET` | `/api/history/exports` | Export history |

Query parameters for `GET /api/indicators`:

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 50) |
| `search` | string | Full-text search on indicator and source |
| `indicator_type` | string | Filter by type (`ip`, `domain`, `url`, `hash`, …) |
| `country` | string | Filter by ISO 3166-1 alpha-2 country code |
| `source_feed` | string | Filter by source feed name |

---

## License

MIT
