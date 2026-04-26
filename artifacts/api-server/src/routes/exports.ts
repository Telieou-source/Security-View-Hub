import { Router } from "express";
import { db, indicatorsTable, feedsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { ExportCsvQueryParams, ExportJsonQueryParams } from "@workspace/api-zod";
import { logExport } from "../lib/history";

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

// CSV — direct file download, browser handles it natively
router.get("/csv", async (req, res) => {
  const parsed = ExportCsvQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const where = buildConditions(parsed.data);
  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);
  await logExport({ format: "csv", indicator_count: rows.length, filters: parsed.data as Record<string, string | undefined> });
  const csv = rowsToCsv(rows);
  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="threat-intel-${today}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(csv);
});

// JSON — direct file download, browser handles it natively
router.get("/json", async (req, res) => {
  const parsed = ExportJsonQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const where = buildConditions(parsed.data);
  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);
  await logExport({ format: "json", indicator_count: rows.length, filters: parsed.data as Record<string, string | undefined> });
  const today = new Date().toISOString().split("T")[0];
  const payload = JSON.stringify({ exported_at: new Date().toISOString(), total: rows.length, indicators: rows });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="threat-intel-${today}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(payload);
});

// Airgap — POST returns lightweight metadata only (for UI display)
router.post("/airgap", async (req, res) => {
  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csv = rowsToCsv(rows);
  const checksum = createHash("sha256").update(csv).digest("hex");

  const manifest = {
    generated_at: new Date().toISOString(),
    total_indicators: rows.length,
    feeds: feedCounts,
  };

  await logExport({ format: "airgap", indicator_count: rows.length });

  // Return metadata only — the full package is served by GET /airgap/package
  res.json({ manifest, checksum });
});

// Airgap package download — GET endpoint that streams the full package as a file
router.get("/airgap/package", async (req, res) => {
  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csv = rowsToCsv(rows);
  const checksum = createHash("sha256").update(csv).digest("hex");

  const manifest = {
    generated_at: new Date().toISOString(),
    total_indicators: rows.length,
    feeds: feedCounts,
  };

  const indicatorsJson = JSON.stringify({ exported_at: manifest.generated_at, total: rows.length, indicators: rows });

  const pkg = JSON.stringify({ manifest, checksum, csv_data: csv, json_data: indicatorsJson });

  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="airgap-package-${today}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pkg);
});

export default router;
