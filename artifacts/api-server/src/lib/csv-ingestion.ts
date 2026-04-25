import { db, feedsTable, indicatorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { lookupCountry } from "./geoip";

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

/**
 * Null-route / loopback IPs used in hosts-file format as redirect targets.
 * These are never real threat indicators — the associated domain is the threat.
 */
const NULL_ROUTE_IPS = new Set(["0.0.0.0", "127.0.0.1", "::1", "::", "255.255.255.255"]);

function isNullRouteIp(value: string): boolean {
  return NULL_ROUTE_IPS.has(value.trim());
}

function detectIndicatorType(value: string, feed_type: string): string {
  // IPv4 / CIDR — must be tested before domain regex
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d+)?$/.test(value)) return "ip";
  // Hashes
  if (/^[0-9a-f]{32}$/i.test(value)) return "md5";
  if (/^[0-9a-f]{40}$/i.test(value)) return "sha1";
  if (/^[0-9a-f]{64}$/i.test(value)) return "sha256";
  // URL: has a scheme (http, https, ftp, …) OR has a path/query after a hostname
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "url";
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/\S*/i.test(value)) return "url";
  // Domain: clean hostname only — no scheme, no path, no port
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(value)) return "domain";

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

/** Returns true when a string looks like an actual indicator value rather than a header label */
function looksLikeIndicatorValue(value: string): boolean {
  const v = value.trim();
  // IPv4 / CIDR
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d+)?$/.test(v)) return true;
  // Hashes
  if (/^[0-9a-f]{32}$/i.test(v)) return true;
  if (/^[0-9a-f]{40}$/i.test(v)) return true;
  if (/^[0-9a-f]{64}$/i.test(v)) return true;
  // URL with scheme
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return true;
  // URL without scheme but with a path (e.g. evil.com/payload)
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/\S*/i.test(v)) return true;
  // Clean domain (hostname only, at least one dot, contains a letter)
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v)) return true;
  return false;
}

/**
 * For headerless plain-text threat feed lines, extract 0-N indicators.
 *
 * Handles the many formats found in the wild:
 *   "192.168.1.1"                     → 1 IP indicator
 *   "192.168.1.1 # just a comment"    → 1 IP indicator, description = "just a comment"
 *   "192.168.1.1 # mail.evil.com"     → 2 indicators: IP + domain
 *   "192.168.1.1 mail.evil.com"       → 2 indicators: IP + domain (space-separated)
 *   "0.0.0.0 ads.domain.com"          → 2 indicators: null-route IP + domain
 *   "bad.domain.com # 1.2.3.4"        → 2 indicators: domain + IP
 */
function extractIndicatorsFromLine(
  rawLine: string,
  sourceFeed: string,
  feedType: string
): NormalizedIndicator[] {
  const results: NormalizedIndicator[] = [];

  // Split at the first # — everything before is data, after is comment/description
  const hashIdx = rawLine.indexOf("#");
  const dataPart = (hashIdx >= 0 ? rawLine.substring(0, hashIdx) : rawLine).trim();
  const commentPart = (hashIdx >= 0 ? rawLine.substring(hashIdx + 1) : "").trim();

  // Tokenize data portion by whitespace
  const dataTokens = dataPart.split(/\s+/).filter(Boolean);

  // Find any indicator-looking tokens in the comment portion
  const commentIndicatorTokens = commentPart
    .split(/\s+/)
    .filter(t => looksLikeIndicatorValue(t));

  // If the comment has no embedded indicators, use it as a plain-text description
  const pureCommentText =
    commentPart && commentIndicatorTokens.length === 0 ? commentPart : null;

  // Emit an indicator for every valid token — from both data and comment parts
  const allTokens: Array<{ token: string; isFromComment: boolean }> = [
    ...dataTokens.map(t => ({ token: t, isFromComment: false })),
    ...commentIndicatorTokens.map(t => ({ token: t, isFromComment: true })),
  ];

  for (const { token, isFromComment } of allTokens) {
    if (!looksLikeIndicatorValue(token)) continue;
    // Skip null-route / loopback IPs (0.0.0.0, 127.0.0.1, etc.) — hosts-file redirect targets
    if (isNullRouteIp(token)) continue;

    const indicator_type = detectIndicatorType(token, feedType);
    let country: string | null = null;
    if (indicator_type === "ip") {
      country = lookupCountry(token);
    }

    results.push({
      indicator: token,
      indicator_type,
      source_feed: sourceFeed,
      // Only attach the plain comment text to the primary (non-comment) tokens
      description: !isFromComment ? pureCommentText : null,
      country,
      first_seen: null,
      last_seen: null,
      confidence: null,
    });
  }

  return results;
}

export function parseCsvToIndicators(
  csvContent: string,
  sourceFeed: string,
  feedType: string
): { indicators: NormalizedIndicator[]; errors: string[] } {
  const errors: string[] = [];
  const indicators: NormalizedIndicator[] = [];

  // Support both comma and tab-delimited, and handle BOM
  const cleaned = csvContent.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() !== "");

  // Find the first non-comment line to inspect
  let firstDataLineIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lines[i].trim();
    if (l !== "" && !l.startsWith("#") && !l.startsWith(";") && !l.startsWith("//")) {
      firstDataLineIdx = i;
      break;
    }
  }

  if (firstDataLineIdx === -1) {
    errors.push("No data found — all lines are empty or comments");
    return { indicators, errors };
  }

  // Auto-detect delimiter (comma vs tab)
  const sampleLine = lines[firstDataLineIdx];
  const delimiter = sampleLine.includes("\t") ? "\t" : ",";

  const splitLine = (line: string): string[] => {
    if (delimiter === "\t") return line.split("\t").map((c) => c.trim());
    return parseCsvLine(line);
  };

  const firstLineCols = splitLine(sampleLine);
  const firstColValue = firstLineCols[0]?.trim() ?? "";
  // For multi-token lines like "1.2.3.4 # domain.com", check only the first whitespace token
  const firstToken = firstColValue.split(/\s+/)[0] ?? "";

  // If the first data line looks like an actual indicator value (IP, hash, domain, URL),
  // this is a headerless plain-text list — treat ALL data lines as indicators
  const isHeaderless = looksLikeIndicatorValue(firstToken);

  let fieldMap: Record<string, number>;
  let dataStartIdx: number;

  if (isHeaderless) {
    // No header row — column 0 is always the indicator, everything else is ignored
    fieldMap = { indicator: 0 };
    dataStartIdx = firstDataLineIdx; // include the first data line
  } else {
    // Treat first data line as CSV header
    fieldMap = detectFieldMapping(firstLineCols);
    dataStartIdx = firstDataLineIdx + 1;

    if (fieldMap.indicator === undefined) {
      errors.push("Could not detect indicator column from header");
      return { indicators, errors };
    }
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(";") || trimmed.startsWith("//")) continue;

    try {
      if (isHeaderless) {
        // Skip pure comment lines in headerless mode
        if (trimmed.startsWith("#")) continue;

        // Smart multi-token parser: handles "IP # domain", "IP domain", hosts-file format, etc.
        const extracted = extractIndicatorsFromLine(trimmed, sourceFeed, feedType);
        indicators.push(...extracted);
      } else {
        // Standard CSV path — header-mapped columns
        const cols = splitLine(line);
        const rawIndicator = sanitizeField(cols[fieldMap.indicator]);
        if (!rawIndicator) continue;

        const rawType = fieldMap.indicator_type !== undefined ? sanitizeField(cols[fieldMap.indicator_type]) : "";
        const indicator_type = rawType || detectIndicatorType(rawIndicator, feedType);

        const rawCountry = fieldMap.country !== undefined ? sanitizeField(cols[fieldMap.country]) || null : null;

        // Enrich IPs with geoip when no country is available in the feed data
        let resolvedCountry = rawCountry;
        if (!resolvedCountry && indicator_type === "ip") {
          resolvedCountry = lookupCountry(rawIndicator);
        }

        const indicator: NormalizedIndicator = {
          indicator: rawIndicator,
          indicator_type,
          source_feed: sourceFeed,
          first_seen: fieldMap.first_seen !== undefined ? sanitizeField(cols[fieldMap.first_seen]) || null : null,
          last_seen: fieldMap.last_seen !== undefined ? sanitizeField(cols[fieldMap.last_seen]) || null : null,
          confidence: fieldMap.confidence !== undefined ? parseInt(cols[fieldMap.confidence] ?? "", 10) || null : null,
          country: resolvedCountry,
          description: fieldMap.description !== undefined ? sanitizeField(cols[fieldMap.description]) || null : null,
        };

        indicators.push(indicator);
      }
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
): Promise<{ success: boolean; indicators_added: number; indicators_updated: number; indicators_skipped: number; errors: string[] }> {
  const { indicators, errors } = parseCsvToIndicators(csvContent, feedName, feedType);
  const { added, updated, skipped } = await upsertIndicators(indicators);
  return {
    success: errors.length === 0 || indicators.length > 0,
    indicators_added: added,
    indicators_updated: updated,
    indicators_skipped: skipped,
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
