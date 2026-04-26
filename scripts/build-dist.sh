#!/usr/bin/env bash
# build-dist.sh — produces a self-contained, air-gapped distribution tarball.
#
# Run from the repo root:
#   bash scripts/build-dist.sh
#
# Output: threat-intel-dist.tar.gz  (~20-50 MB)
#
# What the target machine needs:
#   • Node.js v18+   (https://nodejs.org/en/download)
#   • PostgreSQL 13+

set -euo pipefail

DIST_NAME="threat-intel-dist"
DIST_DIR="$(pwd)/${DIST_NAME}"
TARBALL="${DIST_NAME}.tar.gz"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Global Threat-Intel CSV Aggregator — build-dist    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 0. Clean ──────────────────────────────────────────────────────────────────
rm -rf "${DIST_DIR}" "${TARBALL}"
mkdir -p "${DIST_DIR}"

# ── 1. Build frontend (Vite) ──────────────────────────────────────────────────
echo "[1/4] Building frontend..."
PORT=5173 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/threat-intel build
echo "      Frontend built → artifacts/threat-intel/dist/public/"
echo ""

# ── 2. Build API server (esbuild) ─────────────────────────────────────────────
echo "[2/4] Building API server..."
pnpm --filter @workspace/api-server build
echo "      API server built → artifacts/api-server/dist/"
echo ""

# ── 3. Assemble distribution directory ────────────────────────────────────────
echo "[3/4] Assembling package..."

# API server bundle (esbuild outputs index.mjs; rename to server.mjs for clarity)
cp -r artifacts/api-server/dist/. "${DIST_DIR}/"
mv "${DIST_DIR}/index.mjs" "${DIST_DIR}/server.mjs"
mv "${DIST_DIR}/index.mjs.map" "${DIST_DIR}/server.mjs.map" 2>/dev/null || true

# Frontend static files served by Express at runtime
mkdir -p "${DIST_DIR}/public"
cp -r artifacts/threat-intel/dist/public/. "${DIST_DIR}/public/"

# geoip-lite is externalized from the bundle; must ship it alongside server.mjs
GEOIP_SRC=""
for candidate in \
  "artifacts/api-server/node_modules/geoip-lite" \
  "node_modules/geoip-lite"; do
  if [ -d "${candidate}" ]; then
    GEOIP_SRC="${candidate}"
    break
  fi
done

if [ -z "${GEOIP_SRC}" ]; then
  echo "ERROR: geoip-lite not found in node_modules — run 'pnpm install' first."
  exit 1
fi

mkdir -p "${DIST_DIR}/node_modules/geoip-lite"
cp -r "${GEOIP_SRC}/." "${DIST_DIR}/node_modules/geoip-lite/"

# ── package.json (Node must know this is an ESM package) ──────────────────────
cat > "${DIST_DIR}/package.json" << 'EOF'
{
  "name": "threat-intel-dist",
  "version": "1.0.0",
  "type": "module",
  "description": "Global Threat-Intel CSV Aggregator — pre-built air-gapped distribution"
}
EOF

# ── Database schema ────────────────────────────────────────────────────────────
cp scripts/schema.sql "${DIST_DIR}/schema.sql"

# ── .env.example ──────────────────────────────────────────────────────────────
cat > "${DIST_DIR}/.env.example" << 'EOF'
# ─── Required ───────────────────────────────────────────────────────────────
# PostgreSQL connection string
DATABASE_URL=postgres://username:password@localhost:5432/threatintel

# ─── Recommended ────────────────────────────────────────────────────────────
# Random string used to sign session cookies (generate with: openssl rand -hex 32)
SESSION_SECRET=change-me-to-a-long-random-string

# ─── Optional ───────────────────────────────────────────────────────────────
# Port the server listens on (default: 3000)
PORT=3000
EOF

# ── start.sh ──────────────────────────────────────────────────────────────────
cat > "${DIST_DIR}/start.sh" << 'STARTSCRIPT'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-load .env if it exists in the same directory
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

export NODE_ENV=production
export PORT="${PORT:-3000}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo ""
  echo "ERROR: DATABASE_URL is not set."
  echo ""
  echo "  1. Copy .env.example to .env"
  echo "  2. Edit .env and set DATABASE_URL to your PostgreSQL connection string"
  echo "  3. If this is a first run, initialise the database:"
  echo "       psql -U <user> -d <dbname> -f schema.sql"
  echo ""
  exit 1
fi

echo "Starting Threat-Intel server → http://localhost:${PORT}"
exec node "${SCRIPT_DIR}/server.mjs"
STARTSCRIPT

chmod +x "${DIST_DIR}/start.sh"

# ── Windows batch launcher ─────────────────────────────────────────────────────
cat > "${DIST_DIR}/start.bat" << 'BATSCRIPT'
@echo off
REM Threat-Intel — Windows launcher
REM Edit .env (copy from .env.example) before running.

if not exist ".env" (
  echo ERROR: .env file not found.
  echo Copy .env.example to .env and set DATABASE_URL.
  pause
  exit /b 1
)

REM Load variables from .env (simple key=value, no spaces around =)
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=3000

echo Starting Threat-Intel server ^> http://localhost:%PORT%
node server.mjs
BATSCRIPT

# ── README ────────────────────────────────────────────────────────────────────
cat > "${DIST_DIR}/README.txt" << 'README'
Global Threat-Intel CSV Aggregator
Air-Gapped Distribution
===================================

PREREQUISITES
─────────────
  • Node.js v18 or later
      Download: https://nodejs.org/en/download  (get offline installer)
  • PostgreSQL 13 or later
      Download: https://www.postgresql.org/download/

FIRST-TIME SETUP
────────────────
  1. Create a PostgreSQL database:

       createdb threatintel
       (or use pgAdmin / another GUI tool)

  2. Load the schema (run once):

       psql -U postgres -d threatintel -f schema.sql

  3. Configure the server:

       cp .env.example .env

       Then edit .env and set at minimum:
         DATABASE_URL=postgres://postgres:<password>@localhost:5432/threatintel
         SESSION_SECRET=<any long random string>

STARTING THE SERVER
───────────────────
  Linux / macOS:
    ./start.sh

  Windows:
    Double-click start.bat  (or run it from a Command Prompt)

  Manual (any OS):
    set NODE_ENV=production
    set PORT=3000
    set DATABASE_URL=postgres://...
    node server.mjs

  Then open a browser at:  http://localhost:3000

IMPORTING THREAT FEEDS
──────────────────────
  Use the Import page to:
    • Upload a CSV / TXT / RAW file directly from disk
    • Paste raw feed text
    • Enter a local-network URL (if available inside the air-gap)

  Supported formats include:
    • PhishTank CSV export
    • URLhaus CSV / plain-text
    • Blocklist.de plain-text
    • MISP event exports
    • Any headerless one-indicator-per-line file
    • Hash lists (MD5 / SHA1 / SHA256)
    • Space- or #-delimited formats

  All data is stored locally in your PostgreSQL database.
  No internet connection is required after setup.

EXPORTING DATA
──────────────
  Use the Export page to download your indicators as CSV or JSON for
  use in other tools (SIEMs, firewalls, etc.).

UPGRADING
─────────
  1. Replace all files EXCEPT .env and schema.sql with the new package.
  2. Run schema.sql again — all CREATE TABLE statements use IF NOT EXISTS
     so they are safe to re-run and will only add new tables/columns.
  3. Restart the server.

README

chmod +x "${DIST_DIR}/start.sh"

# ── 4. Create tarball ─────────────────────────────────────────────────────────
echo "[4/4] Creating tarball..."
tar -czf "${TARBALL}" "${DIST_NAME}/"
rm -rf "${DIST_DIR}"

TARBALL_SIZE=$(du -sh "${TARBALL}" | cut -f1)
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Done! Output: ${TARBALL} (${TARBALL_SIZE})          "
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Transfer this file to the air-gapped machine and run:"
echo "    tar -xzf ${TARBALL}"
echo "    cd ${DIST_NAME}"
echo "    cp .env.example .env  # then edit DATABASE_URL"
echo "    ./start.sh"
echo ""
