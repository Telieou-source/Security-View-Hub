import { Router } from "express";
import { db, feedsTable, indicatorsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import {
  CreateFeedBody,
  UpdateFeedBody,
  FetchFeedParams,
  DeleteFeedParams,
} from "@workspace/api-zod";
import { normalizeCsvContent, fetchAndNormalize } from "../lib/csv-ingestion";
import { logImport } from "../lib/history";

const router = Router();

router.get("/", async (req, res) => {
  const feeds = await db.select().from(feedsTable).orderBy(feedsTable.created_at);
  res.json(feeds);
});

router.post("/", async (req, res) => {
  const parsed = CreateFeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { name, url, feed_type, enabled } = parsed.data;
  const [feed] = await db.insert(feedsTable).values({
    name,
    url,
    feed_type: feed_type ?? "other",
    enabled: enabled ?? true,
  }).returning();
  res.status(201).json(feed);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [feed] = await db.select().from(feedsTable).where(eq(feedsTable.id, id));
  if (!feed) {
    res.status(404).json({ error: "Feed not found" });
    return;
  }
  res.json(feed);
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateFeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const updates: Record<string, unknown> = {};
  const { name, url, feed_type, enabled } = parsed.data;
  if (name !== undefined) updates.name = name;
  if (url !== undefined) updates.url = url;
  if (feed_type !== undefined) updates.feed_type = feed_type;
  if (enabled !== undefined) updates.enabled = enabled;

  const [feed] = await db.update(feedsTable).set(updates).where(eq(feedsTable.id, id)).returning();
  if (!feed) {
    res.status(404).json({ error: "Feed not found" });
    return;
  }
  res.json(feed);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [feed] = await db.delete(feedsTable).where(eq(feedsTable.id, id)).returning();
  if (!feed) {
    res.status(404).json({ error: "Feed not found" });
    return;
  }
  res.status(204).send();
});

router.post("/:id/fetch", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [feed] = await db.select().from(feedsTable).where(eq(feedsTable.id, id));
  if (!feed) {
    res.status(404).json({ error: "Feed not found" });
    return;
  }

  const result = await fetchAndNormalize(feed);
  await logImport({
    source_name: feed.name,
    source_url: feed.url,
    feed_type: feed.feed_type,
    result: {
      indicators_added: result.indicators_added,
      indicators_updated: result.indicators_updated,
      indicators_skipped: result.indicators_skipped,
      errors: result.error ? [result.error] : [],
    },
  });
  res.json(result);
});

router.post("/fetch-all", async (req, res) => {
  const feeds = await db.select().from(feedsTable).where(eq(feedsTable.enabled, true));
  const results = await Promise.all(feeds.map((feed) => fetchAndNormalize(feed)));

  await Promise.all(
    results.map((result, i) =>
      logImport({
        source_name: feeds[i].name,
        source_url: feeds[i].url,
        feed_type: feeds[i].feed_type,
        result: {
          indicators_added: result.indicators_added,
          indicators_updated: result.indicators_updated,
          indicators_skipped: result.indicators_skipped,
          errors: result.error ? [result.error] : [],
        },
      })
    )
  );

  const total_added = results.reduce((sum, r) => sum + r.indicators_added, 0);
  const total_updated = results.reduce((sum, r) => sum + r.indicators_updated, 0);

  res.json({
    results,
    total_added,
    total_updated,
    completed_at: new Date().toISOString(),
  });
});

export default router;
