-- Global Threat-Intel CSV Aggregator — PostgreSQL Schema
-- Run once on the air-gapped machine:
--   psql -U <user> -d <database> -f schema.sql

CREATE TABLE IF NOT EXISTS feeds (
  id               SERIAL PRIMARY KEY,
  name             TEXT    NOT NULL,
  url              TEXT    NOT NULL,
  feed_type        TEXT    NOT NULL DEFAULT 'other',
  enabled          BOOLEAN NOT NULL DEFAULT true,
  last_fetched     TIMESTAMPTZ,
  indicator_count  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indicators (
  id             SERIAL PRIMARY KEY,
  indicator      TEXT    NOT NULL,
  indicator_type TEXT    NOT NULL,
  source_feed    TEXT    NOT NULL,
  first_seen     TEXT,
  last_seen      TEXT,
  confidence     INTEGER,
  country        TEXT,
  description    TEXT,
  correlation_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (indicator, source_feed)
);

CREATE INDEX IF NOT EXISTS indicator_idx   ON indicators (indicator);
CREATE INDEX IF NOT EXISTS type_idx        ON indicators (indicator_type);
CREATE INDEX IF NOT EXISTS feed_idx        ON indicators (source_feed);
CREATE INDEX IF NOT EXISTS country_idx     ON indicators (country);
CREATE INDEX IF NOT EXISTS correlation_idx ON indicators (correlation_id);

CREATE TABLE IF NOT EXISTS import_history (
  id                  SERIAL PRIMARY KEY,
  source_name         TEXT    NOT NULL,
  source_url          TEXT,
  feed_type           TEXT    NOT NULL,
  indicators_added    INTEGER NOT NULL DEFAULT 0,
  indicators_updated  INTEGER NOT NULL DEFAULT 0,
  indicators_skipped  INTEGER NOT NULL DEFAULT 0,
  error_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS export_history (
  id              SERIAL PRIMARY KEY,
  format          TEXT    NOT NULL,
  indicator_count INTEGER NOT NULL DEFAULT 0,
  filters         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
