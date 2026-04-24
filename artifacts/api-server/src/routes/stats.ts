import { Router } from "express";
import { db, feedsTable, indicatorsTable } from "@workspace/db";
import { eq, sql, count, gte } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const [{ total_indicators }] = await db
    .select({ total_indicators: count() })
    .from(indicatorsTable);

  const [{ total_feeds }] = await db
    .select({ total_feeds: count() })
    .from(feedsTable);

  const [{ active_feeds }] = await db
    .select({ active_feeds: count() })
    .from(feedsTable)
    .where(eq(feedsTable.enabled, true));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ indicators_added_today }] = await db
    .select({ indicators_added_today: count() })
    .from(indicatorsTable)
    .where(gte(indicatorsTable.created_at, today));

  const [{ unique_countries }] = await db
    .select({ unique_countries: sql<number>`count(distinct ${indicatorsTable.country})` })
    .from(indicatorsTable);

  const [lastFeedRow] = await db
    .select({ last_fetched: feedsTable.last_fetched })
    .from(feedsTable)
    .orderBy(sql`${feedsTable.last_fetched} desc nulls last`)
    .limit(1);

  res.json({
    total_indicators: Number(total_indicators),
    total_feeds: Number(total_feeds),
    active_feeds: Number(active_feeds),
    last_update: lastFeedRow?.last_fetched?.toISOString() ?? null,
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
