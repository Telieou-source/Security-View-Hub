import { Router } from "express";
import { db, indicatorsTable } from "@workspace/db";
import { sql, count, gte } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const [{ total_indicators }] = await db
    .select({ total_indicators: count() })
    .from(indicatorsTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ indicators_added_today }] = await db
    .select({ indicators_added_today: count() })
    .from(indicatorsTable)
    .where(gte(indicatorsTable.created_at, today));

  const [{ unique_countries }] = await db
    .select({ unique_countries: sql<number>`count(distinct ${indicatorsTable.country})` })
    .from(indicatorsTable);

  const [{ import_sources }] = await db
    .select({ import_sources: sql<number>`count(distinct ${indicatorsTable.source_feed})` })
    .from(indicatorsTable);

  const [lastRow] = await db
    .select({ updated_at: indicatorsTable.updated_at })
    .from(indicatorsTable)
    .orderBy(sql`${indicatorsTable.updated_at} desc nulls last`)
    .limit(1);

  res.json({
    total_indicators: Number(total_indicators),
    total_feeds: Number(import_sources),
    active_feeds: Number(import_sources),
    import_sources: Number(import_sources),
    last_update: lastRow?.updated_at?.toISOString() ?? null,
    indicators_added_today: Number(indicators_added_today),
    unique_countries: Number(unique_countries),
  });
});

router.get("/by-type", async (req, res) => {
  const rows = await db
    .select({
      label: indicatorsTable.indicator_type,
      count: count(),
    })
    .from(indicatorsTable)
    .groupBy(indicatorsTable.indicator_type)
    .orderBy(sql`count(*) desc`);

  res.json(rows.map((r) => ({ label: r.label, count: Number(r.count) })));
});

router.get("/by-country", async (req, res) => {
  const rows = await db
    .select({
      label: indicatorsTable.country,
      count: count(),
    })
    .from(indicatorsTable)
    .where(sql`${indicatorsTable.country} is not null and ${indicatorsTable.country} != ''`)
    .groupBy(indicatorsTable.country)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  res.json(rows.map((r) => ({ label: r.label ?? "Unknown", count: Number(r.count) })));
});

router.get("/by-feed", async (req, res) => {
  const rows = await db
    .select({
      label: indicatorsTable.source_feed,
      count: count(),
    })
    .from(indicatorsTable)
    .groupBy(indicatorsTable.source_feed)
    .orderBy(sql`count(*) desc`);

  res.json(rows.map((r) => ({ label: r.label, count: Number(r.count) })));
});

export default router;
