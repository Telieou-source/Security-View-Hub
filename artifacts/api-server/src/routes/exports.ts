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

/**
 * Primes the response stream so the Replit proxy (and any intermediate proxy)
 * sees activity immediately and does not close the connection with a 500 while
 * the heavy DB query is running.
 *
 * Steps:
 *  1. Disable TCP Nagle so small initial writes are not held in the send buffer.
 *  2. Set all headers.
 *  3. Call flushHeaders() — this writes the HTTP status line + headers to the
 *     socket right now, before any body bytes.
 *  4. Write the caller-supplied first chunk of body data (CSV column header,
 *     JSON opening, etc.) which also gets flushed immediately.
 */
function beginStream(res: import("express").Response, headers: Record<string, string>, firstChunk: string) {
  res.socket?.setNoDelay(true);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.flushHeaders();
  res.write(firstChunk);
}

// ── CSV ──────────────────────────────────────────────────────────────────────
router.get("/csv", async (req, res) => {
  const parsed = ExportCsvQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const today = new Date().toISOString().split("T")[0];
  beginStream(res, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="threat-intel-${today}.csv"`,
    "Cache-Control": "no-store",
  }, CSV_HEADER + "\n");

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
router.get("/json", async (req, res) => {
  const parsed = ExportJsonQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const where = buildConditions(parsed.data);
  const today = new Date().toISOString().split("T")[0];
  const exported_at = new Date().toISOString();

  // Fast count so we can embed it in the JSON header before streaming rows
  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(indicatorsTable)
    .where(where);

  beginStream(res, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="threat-intel-${today}.json"`,
    "Cache-Control": "no-store",
  }, `{"exported_at":${JSON.stringify(exported_at)},"total":${total},"indicators":[\n`);

  const rows = await db.select().from(indicatorsTable).where(where).orderBy(indicatorsTable.created_at);
  await logExport({ format: "json", indicator_count: rows.length, filters: parsed.data as Record<string, string | undefined> });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const isLast = i + CHUNK >= rows.length;
    res.write(
      slice.map((r, j) => JSON.stringify(r) + (isLast && j === slice.length - 1 ? "" : ",")).join("\n") + "\n"
    );
  }
  res.write("]}\n");
  res.end();
});

// ── Airgap POST ───────────────────────────────────────────────────────────────
// Returns lightweight manifest + checksum only — no raw data in the body.
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

// ── Airgap GET /package ───────────────────────────────────────────────────────
// Streams the full package as a downloadable file. Flushes the JSON opening
// immediately so the proxy sees activity before the DB queries complete.
router.get("/airgap/package", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const generated_at = new Date().toISOString();

  beginStream(res, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="airgap-package-${today}.json"`,
    "Cache-Control": "no-store",
  }, `{"generated_at":${JSON.stringify(generated_at)}`);

  const rows = await db.select().from(indicatorsTable).orderBy(indicatorsTable.created_at);
  const feeds = await db.select().from(feedsTable);

  const feedCounts = feeds.map((f) => ({
    name: f.name,
    count: rows.filter((r) => r.source_feed === f.name).length,
  }));

  const csvBody = rows.map(rowToCsvLine).join("\n");
  const csvFull = CSV_HEADER + "\n" + csvBody;
  const checksum = createHash("sha256").update(csvFull).digest("hex");

  const manifest = { generated_at, total_indicators: rows.length, feeds: feedCounts };
  const indicatorsJson = JSON.stringify({ exported_at: generated_at, total: rows.length, indicators: rows });

  res.write(`,"manifest":${JSON.stringify(manifest)}`);
  res.write(`,"checksum":${JSON.stringify(checksum)}`);
  res.write(`,"csv_data":${JSON.stringify(csvFull)}`);
  res.write(`,"json_data":${JSON.stringify(indicatorsJson)}`);
  res.write("}");
  res.end();
});

export default router;
