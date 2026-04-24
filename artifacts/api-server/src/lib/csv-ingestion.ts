import { db, feedsTable, indicatorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export type FeedRow = typeof feedsTable.$inferSelect;

export interface NormalizedIndicator {
  indicator: string;
  indicator_type: string;
  source_feed: string;
  first_seen?: string | null;
  last_seen?: string | null;
  confidence?: number | null;
  country?: string | null;
  description?: string | null;
}

export interface IngestResult {
  feed_id: number;
  feed_name: string;
  success: boolean;
  indicators_added: number;
  indicators_updated: number;
  indicators_skipped: number;
  error?: string | null;
}

function sanitizeField(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "")
    .trim()
    .substring(0, 1000);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function detectFieldMapping(headers: string[]): Record<string, number> {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const map: Record<string, number> = {};

  const fieldAliases: Record<string, string[]> = {
    indicator: ["indicator", "ip", "ip_address", "ioc", "value", "host", "domain", "url", "hash", "md5", "sha256", "sha1"],
    indicator_type: ["indicator_type", "type", "ioc_type", "category"],
    first_seen: ["first_seen", "first_seen_utc", "firstseen", "date_added", "date"],
    last_seen: ["last_seen", "last_seen_utc", "lastseen", "updated", "last_online"],
    confidence: ["confidence", "score", "risk_score"],
    country: ["country", "country_code", "cc", "geo_country"],
    description: ["description", "comment", "notes", "reason", "threat_name"],
  };

  for (const [field, aliases] of Object.entries(fieldAliases)) {
    for (const alias of aliases) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) {
        map[field] = idx;
        break;
      }
    }
  }

  if (map.indicator === undefined && lower.length > 0) {
    map.indicator = 0;
  }

  return map;
}

function detectIndicatorType(value: string, feed_type: string): string {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d+)?$/.test(value)) return "ip";
  if (/^[0-9a-f]{32}$/i.test(value)) return "md5";
  if (/^[0-9a-f]{40}$/i.test(value)) return "sha1";
  if (/^[0-9a-f]{64}$/i.test(value)) return "sha256";
  if (/^https?:\/\//i.test(value)) return "url";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return "domain";

  const typeMap: Record<string, string> = {
    ip_reputation: "ip",
    malware: "hash",
    botnet_c2: "ip",
    ssl_abuse: "ssl_cert",
    brute_force: "ip",
    other: "unknown",
  };
  return typeMap[feed_type] ?? "unknown";
}

export function parseCsvToIndicators(
  csvContent: string,
  sourceFeed: string,
  feedType: string
): { indicators: NormalizedIndicator[]; errors: string[] } {
  const errors: string[] = [];
  const indicators: NormalizedIndicator[] = [];

  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim() !== "");

  let headerLine = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (!lines[i].startsWith("#") && !lines[i].startsWith(";")) {
      headerLine = i;
      headers = parseCsvLine(lines[i]);
      break;
    }
  }

  if (headerLine === -1) {
    errors.push("Could not find header row (all lines start with # or ;)");
    return { indicators, errors };
  }

  const fieldMap = detectFieldMapping(headers);

  if (fieldMap.indicator === undefined) {
    errors.push("Could not detect indicator column");
    return { indicators, errors };
  }

  for (let i = headerLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#") || line.startsWith(";") || line.trim() === "") continue;

    try {
      const cols = parseCsvLine(line);
      const rawIndicator = sanitizeField(cols[fieldMap.indicator]);
      if (!rawIndicator) continue;

      const rawType = fieldMap.indicator_type !== undefined ? sanitizeField(cols[fieldMap.indicator_type]) : "";
      const indicator_type = rawType || detectIndicatorType(rawIndicator, feedType);

      const indicator: NormalizedIndicator = {
        indicator: rawIndicator,
        indicator_type,
        source_feed: sourceFeed,
        first_seen: fieldMap.first_seen !== undefined ? sanitizeField(cols[fieldMap.first_seen]) || null : null,
        last_seen: fieldMap.last_seen !== undefined ? sanitizeField(cols[fieldMap.last_seen]) || null : null,
        confidence: fieldMap.confidence !== undefined ? parseInt(cols[fieldMap.confidence] ?? "", 10) || null : null,
        country: fieldMap.country !== undefined ? sanitizeField(cols[fieldMap.country]) || null : null,
        description: fieldMap.description !== undefined ? sanitizeField(cols[fieldMap.description]) || null : null,
      };

      indicators.push(indicator);
    } catch (err) {
      errors.push(`Row ${i + 1}: ${String(err)}`);
    }
  }

  return { indicators, errors };
}

export async function upsertIndicators(
  indicators: NormalizedIndicator[]
): Promise<{ added: number; updated: number; skipped: number }> {
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const BATCH = 200;
  for (let i = 0; i < indicators.length; i += BATCH) {
    const batch = indicators.slice(i, i + BATCH);

    for (const ind of batch) {
      try {
        const [existing] = await db
          .select({ id: indicatorsTable.id })
          .from(indicatorsTable)
          .where(
            and(
              eq(indicatorsTable.indicator, ind.indicator),
              eq(indicatorsTable.source_feed, ind.source_feed)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(indicatorsTable)
            .set({
              last_seen: ind.last_seen,
              confidence: ind.confidence,
              country: ind.country,
              description: ind.description,
              updated_at: new Date(),
            })
            .where(eq(indicatorsTable.id, existing.id));
          updated++;
        } else {
          await db.insert(indicatorsTable).values({
            indicator: ind.indicator,
            indicator_type: ind.indicator_type,
            source_feed: ind.source_feed,
            first_seen: ind.first_seen,
            last_seen: ind.last_seen,
            confidence: ind.confidence,
            country: ind.country,
            description: ind.description,
            updated_at: new Date(),
          });
          added++;
        }
      } catch {
        skipped++;
      }
    }
  }

  return { added, updated, skipped };
}

export async function normalizeCsvContent(
  csvContent: string,
  feedName: string,
  feedType: string
): Promise<{ success: boolean; indicators_added: number; indicators_updated: number; errors: string[] }> {
  const { indicators, errors } = parseCsvToIndicators(csvContent, feedName, feedType);
  const { added, updated } = await upsertIndicators(indicators);
  return {
    success: errors.length === 0 || indicators.length > 0,
    indicators_added: added,
    indicators_updated: updated,
    errors,
  };
}

export async function fetchAndNormalize(feed: FeedRow): Promise<IngestResult> {
  const result: IngestResult = {
    feed_id: feed.id,
    feed_name: feed.name,
    success: false,
    indicators_added: 0,
    indicators_updated: 0,
    indicators_skipped: 0,
    error: null,
  };

  try {
    const response = await fetch(feed.url, {
      headers: { "User-Agent": "ThreatIntelAggregator/1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      await db.update(feedsTable).set({ last_fetched: new Date() }).where(eq(feedsTable.id, feed.id));
      return result;
    }

    const csvContent = await response.text();
    const { indicators, errors } = parseCsvToIndicators(csvContent, feed.name, feed.feed_type);

    if (errors.length > 0) {
      logger.warn({ feedId: feed.id, errors }, "CSV parsing errors");
    }

    const { added, updated, skipped } = await upsertIndicators(indicators);

    await db
      .update(feedsTable)
      .set({
        last_fetched: new Date(),
        indicator_count: added + updated,
      })
      .where(eq(feedsTable.id, feed.id));

    result.success = true;
    result.indicators_added = added;
    result.indicators_updated = updated;
    result.indicators_skipped = skipped;
  } catch (err) {
    result.error = String(err);
    logger.error({ feedId: feed.id, err }, "Failed to fetch feed");
  }

  return result;
}
