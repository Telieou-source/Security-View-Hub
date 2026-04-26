import { Router } from "express";
import { db, indicatorsTable, feedsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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

const CSV_HEADER = "id,indicator,indicator_type,source_feed,first_seen,last_seen,confidence,country,description,created_at,updated_at";

function rowToCsvLine(r: typeof indicatorsTable.$inferSelect): string {
  return [
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
  ].join(",");
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// Writes the column-header line immediately so the proxy sees activity before
// the heavy DB query completes, preventing a proxy-level timeout (500).
router.get("/csv", async (req, res) => {
  const parsed = ExportCsvQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="threat-intel-${today}.csv"`);
  res.setHeader("Cache-Control", "no-store");

  // Flush headers + CSV column header right away
  res.write(CSV_HEADER + "\n");

  const where = buildConditions(parsed.data);
  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);

  await logExport({ format: "csv", indicator_count: rows.length, filters: parsed.data as Record<string, string | undefined> });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    res.write(rows.slice(i, i + CHUNK).map(rowToCsvLine).join("\n") + "\n");
  }

  res.end();
});

// ── JSON ─────────────────────────────────────────────────────────────────────
// Counts first (fast), writes the JSON wrapper immediately, then streams rows.
router.get("/json", async (req, res) => {
  const parsed = ExportJsonQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }

  const where = buildConditions(parsed.data);
  const today = new Date().toISOString().split("T")[0];
  const exported_at = new Date().toISOString();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="threat-intel-${today}.json"`);
  res.setHeader("Cache-Control", "no-store");

  // Fast count so we can write the header immediately
  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(indicatorsTable)
    .where(where);

  // Flush JSON wrapper start right away
  res.write(`{"exported_at":${JSON.stringify(exported_at)},"total":${total},"indicators":[\n`);

  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);

  await logExport({ format: "json", indicator_count: rows.length, filters: parsed.data as Record<string, string | undefined> });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const isLast = i + CHUNK >= rows.length;
    const lines = slice.map((r, j) => {
      const isLastRow = isLast && j === slice.length - 1;
      return JSON.stringify(r) + (isLastRow ? "" : ",");
    });
    res.write(lines.join("\n") + "\n");
  }

  res.write("]}\n");
  res.end();
});

// ── Airgap POST ───────────────────────────────────────────────────────────────
// Lightweight metadata endpoint — no raw data in response, only manifest + checksum.
router.post("/airgap", async (req, res) => {
  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csvBody = rows.map(rowToCsvLine).join("\n");
  const checksum = createHash("sha256").update(CSV_HEADER + "\n" + csvBody).digest("hex");

  const manifest = {
    generated_at: new Date().toISOString(),
    total_indicators: rows.length,
    feeds: feedCounts,
  };

  await logExport({ format: "airgap", indicator_count: rows.length });

  res.json({ manifest, checksum });
});

// ── Airgap GET package ────────────────────────────────────────────────────────
// Full package as a downloadable file. Writes the JSON opening key immediately
// so the proxy sees activity before the heavy DB work completes.
router.get("/airgap/package", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const generated_at = new Date().toISOString();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="airgap-package-${today}.json"`);
  res.setHeader("Cache-Control", "no-store");

  // Write the opening of a valid JSON object immediately to keep the connection alive
  res.write(`{"generated_at":${JSON.stringify(generated_at)}`);

  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csvBody = rows.map(rowToCsvLine).join("\n");
  const csvFull = CSV_HEADER + "\n" + csvBody;
  const checksum = createHash("sha256").update(csvFull).digest("hex");

  const manifest = {
    generated_at,
    total_indicators: rows.length,
    feeds: feedCounts,
  };

  // Stream the rest of the JSON
  res.write(`,"manifest":${JSON.stringify(manifest)}`);
  res.write(`,"checksum":${JSON.stringify(checksum)}`);
  res.write(`,"csv_data":${JSON.stringify(csvFull)}`);

  const indicatorsJson = JSON.stringify({
    exported_at: generated_at,
    total: rows.length,
    indicators: rows,
  });
  res.write(`,"json_data":${JSON.stringify(indicatorsJson)}`);
  res.write("}");
  res.end();
});

export default router;
