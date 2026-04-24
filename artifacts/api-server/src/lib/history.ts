import { db, importHistoryTable, exportHistoryTable } from "@workspace/db";

export interface ImportResult {
  indicators_added: number;
  indicators_updated: number;
  indicators_skipped: number;
  errors: string[];
}

export async function logImport(params: {
  source_name: string;
  source_url?: string;
  feed_type: string;
  result: ImportResult;
}) {
  try {
    await db.insert(importHistoryTable).values({
      source_name: params.source_name,
      source_url: params.source_url ?? null,
      feed_type: params.feed_type,
      indicators_added: params.result.indicators_added,
      indicators_updated: params.result.indicators_updated,
      indicators_skipped: params.result.indicators_skipped,
      error_count: params.result.errors.length,
    });
  } catch (err) {
    console.error("Failed to log import history:", err);
  }
}

export async function logExport(params: {
  format: string;
  indicator_count: number;
  filters?: Record<string, string | undefined>;
}) {
  try {
    await db.insert(exportHistoryTable).values({
      format: params.format,
      indicator_count: params.indicator_count,
      filters: params.filters ?? null,
    });
  } catch (err) {
    console.error("Failed to log export history:", err);
  }
}
