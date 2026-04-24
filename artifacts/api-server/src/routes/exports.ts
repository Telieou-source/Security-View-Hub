import { Router } from "express";
import { db, indicatorsTable, feedsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { createHash } from "crypto";
import { ExportCsvQueryParams, ExportJsonQueryParams } from "@workspace/api-zod";

const router = Router();

function buildConditions(params: { indicator_type?: string; source_feed?: string; country?: string }) {
  const conditions = [];
  if (params.indicator_type) conditions.push(eq(indicatorsTable.indicator_type, params.indicator_type));
  if (params.source_feed) conditions.push(eq(indicatorsTable.source_feed, params.source_feed));
  if (params.country) conditions.push(eq(indicatorsTable.country, params.country));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function rowsToCsv(rows: typeof indicatorsTable.$inferSelect[]) {
  const header = "id,indicator,indicator_type,source_feed,first_seen,last_seen,confidence,country,description,created_at,updated_at";
  const lines = rows.map((r) =>
    [
      r.id,
      `"${(r.indicator ?? "").replace(/"/g, '""')}"`,
      `"${(r.indicator_type ?? "").replace(/"/g, '""')}"`,
      `"${(r.source_feed ?? "").replace(/"/g, '""')}"`,
      r.first_seen ?? "",
      r.last_seen ?? "",
      r.confidence ?? "",
      `"${(r.country ?? "").replace(/"/g, '""')}"`,
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      r.created_at?.toISOString() ?? "",
      r.updated_at?.toISOString() ?? "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

router.get("/csv", async (req, res) => {
  const parsed = ExportCsvQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const where = buildConditions(parsed.data);
  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);
  const csv = rowsToCsv(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=threat-intel-export.csv");
  res.send(csv);
});

router.get("/json", async (req, res) => {
  const parsed = ExportJsonQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const where = buildConditions(parsed.data);
  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);
  res.json({
    exported_at: new Date().toISOString(),
    total: rows.length,
    indicators: rows,
  });
});

router.post("/airgap", async (req, res) => {
  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csv = rowsToCsv(rows);
  const json = JSON.stringify({ exported_at: new Date().toISOString(), total: rows.length, indicators: rows }, null, 2);

  const checksum = createHash("sha256").update(csv).digest("hex");

  const manifest = {
    generated_at: new Date().toISOString(),
    total_indicators: rows.length,
    feeds: feedCounts,
  };

  res.json({
    manifest,
    checksum,
    csv_data: csv,
    json_data: json,
  });
});

export default router;
