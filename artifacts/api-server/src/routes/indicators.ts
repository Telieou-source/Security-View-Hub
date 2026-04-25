import { Router } from "express";
import { db, indicatorsTable, importHistoryTable } from "@workspace/db";
import { eq, ilike, and, or, sql, count, inArray } from "drizzle-orm";
import { ListIndicatorsQueryParams, ImportIndicatorsBody } from "@workspace/api-zod";
import { normalizeCsvContent } from "../lib/csv-ingestion";
import { logImport } from "../lib/history";
import { lookupCountry } from "../lib/geoip";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListIndicatorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params", details: parsed.error.issues });
    return;
  }
  const { indicator_type, source_feed, country, search, page, limit } = parsed.data;

  const conditions = [];
  if (indicator_type) conditions.push(eq(indicatorsTable.indicator_type, indicator_type));
  if (source_feed) conditions.push(eq(indicatorsTable.source_feed, source_feed));
  if (country) conditions.push(eq(indicatorsTable.country, country));
  if (search) conditions.push(
    or(
      ilike(indicatorsTable.indicator, `%${search}%`),
      ilike(indicatorsTable.source_feed, `%${search}%`)
    )!
  );

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const pageNum = page ?? 1;
  const limitNum = limit ?? 50;
  const offset = (pageNum - 1) * limitNum;

  const [{ value: totalCount }] = await db
    .select({ value: count() })
    .from(indicatorsTable)
    .where(where);

  const data = await db
    .select()
    .from(indicatorsTable)
    .where(where)
    .orderBy(indicatorsTable.updated_at)
    .limit(limitNum)
    .offset(offset);

  res.json({
    data,
    total: Number(totalCount),
    page: pageNum,
    limit: limitNum,
    total_pages: Math.ceil(Number(totalCount) / limitNum),
  });
});

router.post("/import", async (req, res) => {
  const parsed = ImportIndicatorsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { feed_name, csv_content, feed_type } = parsed.data;
  const result = await normalizeCsvContent(csv_content, feed_name, feed_type);
  await logImport({
    source_name: feed_name,
    feed_type,
    result: {
      indicators_added: result.indicators_added,
      indicators_updated: result.indicators_updated,
      indicators_skipped: result.indicators_skipped,
      errors: result.errors,
    },
  });
  res.json(result);
});

const ImportUrlBody = z.object({
  url: z.string().url(),
  feed_name: z.string().min(1),
  feed_type: z.string().min(1),
});

router.post("/import-url", async (req, res) => {
  const parsed = ImportUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { url, feed_name, feed_type } = parsed.data;

  let csvContent: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ThreatIntelAggregator/1.0" },
    });
    clearTimeout(timeout);
    if (!response.ok) {
      res.status(502).json({ error: `Remote fetch failed: ${response.status} ${response.statusText}` });
      return;
    }
    csvContent = await response.text();
  } catch (err: any) {
    res.status(502).json({ error: `Could not fetch URL: ${err?.message ?? String(err)}` });
    return;
  }

  const result = await normalizeCsvContent(csvContent, feed_name, feed_type);
  await logImport({
    source_name: feed_name,
    source_url: url,
    feed_type,
    result: {
      indicators_added: result.indicators_added,
      indicators_updated: result.indicators_updated,
      indicators_skipped: result.indicators_skipped,
      errors: result.errors,
    },
  });
  res.json(result);
});

router.delete("/purge", async (_req, res) => {
  const [{ count: deletedIndicators }] = await db
    .delete(indicatorsTable)
    .returning({ count: indicatorsTable.id })
    .then(rows => [{ count: rows.length }]);

  await db.delete(importHistoryTable);

  res.json({ deleted_indicators: deletedIndicators });
});

router.post("/enrich-geo", async (_req, res) => {
  const BATCH = 5000;
  let offset = 0;
  let total = 0;

  while (true) {
    // Fetch a large batch of IPs without a country
    const rows = await db
      .select({ id: indicatorsTable.id, indicator: indicatorsTable.indicator })
      .from(indicatorsTable)
      .where(
        and(
          eq(indicatorsTable.indicator_type, "ip"),
          sql`${indicatorsTable.country} is null`
        )
      )
      .limit(BATCH);

    if (rows.length === 0) break;

    // Resolve all countries in memory (fast — no I/O)
    const byCountry = new Map<string, number[]>();
    const unresolved: number[] = [];
    for (const row of rows) {
      const country = lookupCountry(row.indicator);
      if (country) {
        if (!byCountry.has(country)) byCountry.set(country, []);
        byCountry.get(country)!.push(row.id);
        total++;
      } else {
        // Mark as "XX" to avoid re-scanning unreachable IPs
        unresolved.push(row.id);
      }
    }

    // One UPDATE per country — massively reduces round-trips vs per-row updates
    for (const [country, ids] of byCountry.entries()) {
      const CHUNK = 1000;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await db
          .update(indicatorsTable)
          .set({ country })
          .where(inArray(indicatorsTable.id, ids.slice(i, i + CHUNK)));
      }
    }

    // Mark unresolvable IPs so they're skipped in subsequent runs
    if (unresolved.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < unresolved.length; i += CHUNK) {
        await db
          .update(indicatorsTable)
          .set({ country: "XX" })
          .where(inArray(indicatorsTable.id, unresolved.slice(i, i + CHUNK)));
      }
    }

    offset += BATCH;
  }

  res.json({ enriched: total });
});

export default router;
