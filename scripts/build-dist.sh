#!/usr/bin/env bash
# build-dist.sh — produces self-contained, air-gapped distribution packages.
#
# Run from the repo root:
#   bash scripts/build-dist.sh
#
# Outputs:
#   threat-intel-dist.tar.gz  — Linux / macOS
#   threat-intel-dist.zip     — Windows (native extraction, no extra tools needed)
#
# What the target machine needs:
#   • Node.js v18+   (https://nodejs.org/en/download)
#   • PostgreSQL 13+ (https://www.postgresql.org/download/)

set -euo pipefail

DIST_NAME="threat-intel-dist"
DIST_DIR="$(pwd)/${DIST_NAME}"
TARBALL="${DIST_NAME}.tar.gz"
ZIPFILE="${DIST_NAME}.zip"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Global Threat-Intel CSV Aggregator — build-dist    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 0. Clean ──────────────────────────────────────────────────────────────────
rm -rf "${DIST_DIR}" "${TARBALL}" "${ZIPFILE}"
mkdir -p "${DIST_DIR}"

# ── 1. Build frontend (Vite) ──────────────────────────────────────────────────
echo "[1/5] Building frontend..."
PORT=5173 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/threat-intel build
echo "      Frontend built → artifacts/threat-intel/dist/public/"
echo ""

# ── 2. Build API server (esbuild) ─────────────────────────────────────────────
echo "[2/5] Building API server..."
pnpm --filter @workspace/api-server build
echo "      API server built → artifacts/api-server/dist/"
echo ""

# ── 3. Assemble distribution directory ────────────────────────────────────────
echo "[3/5] Assembling package..."

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
# Random string used to sign session cookies
# Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=change-me-to-a-long-random-string

# ─── Optional ───────────────────────────────────────────────────────────────
# Port the server listens on (default: 3000)
PORT=3000
EOF

# ── start.sh (Linux / macOS) ──────────────────────────────────────────────────
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

# ── start.bat (Windows — double-click launcher) ────────────────────────────────
cat > "${DIST_DIR}/start.bat" << 'BATSCRIPT'
@echo off
title Threat-Intel Server

REM ── Change to the directory where this script lives ──────────────────────────
cd /d "%~dp0"

REM ── Check for .env ────────────────────────────────────────────────────────────
if not exist ".env" (
  echo.
  echo  ERROR: .env file not found.
  echo.
  echo  Run setup.bat first, or:
  echo    1. Copy .env.example to .env
  echo    2. Edit .env and set DATABASE_URL and SESSION_SECRET
  echo.
  pause
  exit /b 1
)

echo.
echo  Starting Threat-Intel -- open http://localhost:3000
echo  Press Ctrl+C to stop.
echo.

REM ── Node 20+ loads .env natively; NODE_ENV forced to production ───────────────
set NODE_ENV=production
node --env-file=.env server.mjs
if %ERRORLEVEL% neq 0 (
  echo.
  echo  Server exited with an error. Check the output above.
  pause
)
BATSCRIPT

# ── setup.bat (Windows — first-time setup wrapper) ────────────────────────────
cat > "${DIST_DIR}/setup.bat" << 'SETUPBAT'
@echo off
title Threat-Intel Setup
cd /d "%~dp0"

echo.
echo  Threat-Intel — First-Time Setup
echo  ================================
echo.

REM Check for PowerShell
where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo  ERROR: PowerShell is required but not found.
  echo  Please run setup.ps1 manually or configure .env by hand.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
SETUPBAT

# ── setup.ps1 (Windows — interactive first-time setup) ────────────────────────
# NOTE: ASCII-only characters used throughout so PowerShell 5.1 reads the file
#       correctly regardless of the system code page (no UTF-8 BOM required).
cat > "${DIST_DIR}/setup.ps1" << 'SETUPPS1'
#Requires -Version 5.1
# setup.ps1 -- Interactive first-time setup for Windows
# Run via setup.bat, or directly:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Write-Header($text) {
    $line = "-" * ($text.Length + 2)
    Write-Host ""
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "  $line" -ForegroundColor DarkGray
}

function Write-Ok($text)   { Write-Host "  [OK]    $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [WARN]  $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "  [ERROR] $text" -ForegroundColor Red }
function Write-Step($text) { Write-Host "  -->  $text"   -ForegroundColor White }

Write-Host ""
Write-Host "  +--------------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |  Global Threat-Intel -- Windows Setup      |" -ForegroundColor DarkCyan
Write-Host "  +--------------------------------------------+" -ForegroundColor DarkCyan

# -- 1. Check Node.js ---------------------------------------------------------
Write-Header "Checking prerequisites"

try {
    $nodeVer = (& node --version 2>&1).ToString().Trim()
    $nodeMajor = [int]($nodeVer -replace '^v(\d+)\..*', '$1')
    if ($nodeMajor -ge 18) {
        Write-Ok "Node.js $nodeVer"
    } else {
        Write-Err "Node.js $nodeVer found but v18+ is required."
        Write-Step "Download: https://nodejs.org/en/download"
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Err "Node.js not found. Install v18+ from https://nodejs.org/en/download"
    Read-Host "Press Enter to exit"
    exit 1
}

# -- 2. Check PostgreSQL -------------------------------------------------------
$psqlPath = $null
try {
    $psqlPath = (Get-Command psql -ErrorAction Stop).Source
    $psqlVerRaw = (& psql --version 2>&1).ToString()
    $psqlVer = $psqlVerRaw -replace "psql \(PostgreSQL\) ", ""
    Write-Ok "PostgreSQL $psqlVer"
} catch {
    Write-Warn "psql not found in PATH."
    Write-Step "Make sure PostgreSQL\bin is in your system PATH."
    Write-Step "Download: https://www.postgresql.org/download/windows/"
    Write-Host ""
    $cont = Read-Host "  Continue anyway? (y/N)"
    if ($cont -notmatch '^[yY]') { exit 1 }
}

# -- 3. Configure .env --------------------------------------------------------
Write-Header "Configuration"

if (Test-Path ".env") {
    Write-Ok ".env already exists -- skipping creation."
    $appPort = "3000"
    $content = Get-Content ".env" -Raw
    if ($content -match 'PORT=(\d+)') { $appPort = $Matches[1] }
} else {
    Write-Step "Creating .env from template..."
    Write-Host ""
    Write-Host "  Enter your PostgreSQL connection details:" -ForegroundColor White

    $pgUser = Read-Host "    PostgreSQL username [postgres]"
    if ([string]::IsNullOrWhiteSpace($pgUser)) { $pgUser = "postgres" }

    $pgPassSecure = Read-Host "    PostgreSQL password" -AsSecureString
    $pgPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassSecure)
    )

    $pgHost = Read-Host "    PostgreSQL host [localhost]"
    if ([string]::IsNullOrWhiteSpace($pgHost)) { $pgHost = "localhost" }

    $pgPort = Read-Host "    PostgreSQL port [5432]"
    if ([string]::IsNullOrWhiteSpace($pgPort)) { $pgPort = "5432" }

    $pgDb = Read-Host "    Database name [threatintel]"
    if ([string]::IsNullOrWhiteSpace($pgDb)) { $pgDb = "threatintel" }

    $appPort = Read-Host "    App port [3000]"
    if ([string]::IsNullOrWhiteSpace($appPort)) { $appPort = "3000" }

    $secret = -join ((65..90) + (97..122) + (48..57) |
        Get-Random -Count 48 | ForEach-Object { [char]$_ })

    $dbUrl = "postgres://" + $pgUser + ":" + $pgPassPlain + "@" + $pgHost + ":" + $pgPort + "/" + $pgDb

    $envLines = @(
        "DATABASE_URL=" + $dbUrl,
        "SESSION_SECRET=" + $secret,
        "PORT=" + $appPort
    )
    Set-Content -Path ".env" -Value $envLines -Encoding ASCII
    Write-Ok ".env created."

    # -- 4. Create database ---------------------------------------------------
    Write-Header "Database setup"

    if ($psqlPath) {
        Write-Step "Creating database '$pgDb' (safe if it already exists)..."
        try {
            $env:PGPASSWORD = $pgPassPlain
            & psql -U $pgUser -h $pgHost -p $pgPort -c "CREATE DATABASE $pgDb;" 2>&1 | Out-Null
            Write-Ok "Database '$pgDb' ready."
        } catch {
            Write-Warn "Could not create database -- it may already exist (that is fine)."
        }

        Write-Step "Loading schema..."
        try {
            & psql -U $pgUser -h $pgHost -p $pgPort -d $pgDb -f "schema.sql" 2>&1 | Out-Null
            Write-Ok "Schema loaded."
        } catch {
            Write-Err "Schema load failed: $_"
            Write-Step "Run manually: psql -U $pgUser -d $pgDb -f schema.sql"
        }
        $env:PGPASSWORD = ""
    } else {
        Write-Warn "Skipping automatic DB setup (psql not in PATH)."
        Write-Step "Create the database manually, then run:"
        Write-Step "  psql -U <user> -d $pgDb -f schema.sql"
    }
}

# -- 5. Done ------------------------------------------------------------------
Write-Host ""
Write-Host "  +--------------------------------------------+" -ForegroundColor Green
Write-Host "  |  Setup complete!                           |" -ForegroundColor Green
Write-Host "  +--------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the server:" -ForegroundColor White
Write-Host "    Double-click start.bat" -ForegroundColor Cyan
Write-Host "    -- or --" -ForegroundColor DarkGray
Write-Host "    node server.mjs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Then open: http://localhost:$appPort" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to close"
SETUPPS1

# ── README.txt ────────────────────────────────────────────────────────────────
cat > "${DIST_DIR}/README.txt" << 'README'
Global Threat-Intel CSV Aggregator
Air-Gapped Distribution
===================================

PREREQUISITES
─────────────
  • Node.js v18 or later
      Download: https://nodejs.org/en/download  (get the LTS offline installer)
  • PostgreSQL 13 or later
      Download: https://www.postgresql.org/download/

WINDOWS — QUICK START (Recommended)
─────────────────────────────────────
  1. Extract this zip to a folder (e.g. C:\threat-intel\)
  2. Double-click  setup.bat
       • Checks Node.js and PostgreSQL
       • Creates the .env configuration file
       • Creates the database and loads the schema automatically
  3. Double-click  start.bat
  4. Open http://localhost:3000

LINUX / MACOS — QUICK START
─────────────────────────────
  1. Extract the tarball:
       tar -xzf threat-intel-dist.tar.gz
       cd threat-intel-dist

  2. Create and initialise the database (first run only):
       createdb threatintel
       psql -U postgres -d threatintel -f schema.sql

  3. Configure:
       cp .env.example .env
       # Edit .env: set DATABASE_URL and SESSION_SECRET

  4. Start:
       ./start.sh

  5. Open http://localhost:3000

MANUAL SETUP (any OS)
──────────────────────
  1. Copy .env.example to .env and edit it:

       DATABASE_URL=postgres://username:password@localhost:5432/threatintel
       SESSION_SECRET=<any long random string>
       PORT=3000           (optional — default is 3000)

  2. Create the database and load schema:

       createdb threatintel
       psql -U postgres -d threatintel -f schema.sql

  3. Start the server:

       node server.mjs

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
  Use the Export page to download your indicators as CSV, JSON, or a
  full air-gapped bundle for transfer to another machine.

UPGRADING
─────────
  1. Replace all files EXCEPT .env with files from the new package.
  2. Run schema.sql again (safe to re-run — uses IF NOT EXISTS):
       psql -U postgres -d threatintel -f schema.sql
  3. Restart the server.

README

chmod +x "${DIST_DIR}/start.sh"

# ── 4. Create tarball (Linux / macOS) ─────────────────────────────────────────
echo "[4/5] Creating tarball (Linux/macOS)..."
tar -czf "${TARBALL}" "${DIST_NAME}/"
TARBALL_SIZE=$(du -sh "${TARBALL}" | cut -f1)
echo "      ${TARBALL} (${TARBALL_SIZE})"

# ── 5. Create zip (Windows) ───────────────────────────────────────────────────
echo "[5/5] Creating zip (Windows)..."
node - << 'ZIPSCRIPT'
import { createWriteStream, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';

// Minimal ZIP writer — no external dependencies
const DIST = 'threat-intel-dist';
const OUT  = 'threat-intel-dist.zip';

function toBytes(n, len) {
  const b = Buffer.alloc(len);
  b.writeUIntLE(n, 0, len);
  return b;
}

function dosDateTime(date) {
  const d = date ?? new Date();
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function walkDir(dir, base = dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkDir(full, base));
    } else {
      entries.push({ full, rel: relative(base, full).replace(/\\/g, '/'), mtime: stat.mtime });
    }
  }
  return entries;
}

const out = createWriteStream(OUT);
const write = (buf) => new Promise(r => out.write(buf, r));

let offset = 0;
const centralDir = [];

const files = walkDir(DIST);
for (const { full, rel, mtime } of files) {
  const data   = readFileSync(full);
  const name   = Buffer.from(rel);
  const crc    = crc32(data);
  const { date, time } = dosDateTime(mtime);

  // Local file header
  const lfh = Buffer.concat([
    Buffer.from([0x50,0x4B,0x03,0x04]), // signature
    toBytes(20, 2),                      // version needed
    toBytes(0,  2),                      // flags
    toBytes(0,  2),                      // compression (stored)
    toBytes(time, 2),
    toBytes(date, 2),
    toBytes(crc, 4),
    toBytes(data.length, 4),             // compressed size
    toBytes(data.length, 4),             // uncompressed size
    toBytes(name.length, 2),
    toBytes(0, 2),                       // extra field length
    name,
  ]);

  centralDir.push({ rel, name, crc, size: data.length, date, time, offset });
  offset += lfh.length + data.length;

  await write(lfh);
  await write(data);
}

// Central directory
const cdStart = offset;
for (const e of centralDir) {
  const cd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x01,0x02]), // signature
    toBytes(20, 2), toBytes(20, 2),      // version made by / needed
    toBytes(0,  2),                      // flags
    toBytes(0,  2),                      // compression (stored)
    toBytes(e.time, 2), toBytes(e.date, 2),
    toBytes(e.crc,  4),
    toBytes(e.size, 4), toBytes(e.size, 4),
    toBytes(e.name.length, 2),
    toBytes(0, 2), toBytes(0, 2), toBytes(0, 2), // extra, comment, disk
    toBytes(0, 2),                        // internal attrs
    toBytes(0, 4),                        // external attrs
    toBytes(e.offset, 4),
    e.name,
  ]);
  await write(cd);
  offset += cd.length;
}

// End of central directory record
const cdSize = offset - cdStart;
const eocd = Buffer.concat([
  Buffer.from([0x50,0x4B,0x05,0x06]),
  toBytes(0, 2), toBytes(0, 2),
  toBytes(centralDir.length, 2),
  toBytes(centralDir.length, 2),
  toBytes(cdSize, 4),
  toBytes(cdStart, 4),
  toBytes(0, 2),
]);
await write(eocd);
out.end();
console.log('ZIP written:', OUT);
ZIPSCRIPT

ZIP_SIZE=$(du -sh "${ZIPFILE}" | cut -f1)
echo "      ${ZIPFILE} (${ZIP_SIZE})"

# ── Clean up staging directory ─────────────────────────────────────────────────
rm -rf "${DIST_DIR}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Done!                                                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Linux / macOS  →  ${TARBALL} (${TARBALL_SIZE})              "
echo "║  Windows        →  ${ZIPFILE}  (${ZIP_SIZE})                 "
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Windows users:"
echo "    1. Extract ${ZIPFILE}"
echo "    2. Double-click setup.bat   (first time only)"
echo "    3. Double-click start.bat"
echo ""
echo "  Linux/macOS users:"
echo "    tar -xzf ${TARBALL} && cd ${DIST_NAME}"
echo "    cp .env.example .env && ./start.sh"
echo ""
