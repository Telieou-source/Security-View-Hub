# Global Threat-Intel CSV Aggregator

## Overview

Full-stack threat intelligence platform that ingests CSV feeds from open-source threat intel sources, normalizes them into a unified schema, and provides a dashboard for exploration, filtering, and export.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/threat-intel), Tailwind CSS, Recharts, wouter routing
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Feed Management**: Add/edit/delete CSV threat feed URLs (IP reputation, malware, botnet C2, SSL abuse, brute force)
- **Feed Ingestion**: Fetch and normalize CSV feeds with automatic field detection and deduplication
- **Indicator Database**: Paginated, searchable, filterable view of all normalized indicators
- **Offline Import**: Paste CSV content directly for air-gapped environments
- **Export**: Download as CSV, JSON, or air-gap package with SHA256 checksum and manifest
- **Dashboard**: Stats overview with charts by type, feed source, and country
- **Documentation**: Built-in docs for all workflows

## Schema

### Unified Indicator Schema
- `indicator` — the IoC value (IP, hash, domain, URL, etc.)
- `indicator_type` — ip, md5, sha1, sha256, domain, url, ssl_cert, unknown
- `source_feed` — feed name
- `first_seen`, `last_seen` — timestamps
- `confidence` — 0-100 score
- `country` — geo attribution
- `description` — freetext context

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Artifacts

- `artifacts/threat-intel` — React frontend (preview at `/`)
- `artifacts/api-server` — Express API server (at `/api`)
