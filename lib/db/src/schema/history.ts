import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const importHistoryTable = pgTable("import_history", {
  id: serial("id").primaryKey(),
  source_name: text("source_name").notNull(),
  source_url: text("source_url"),
  feed_type: text("feed_type").notNull(),
  indicators_added: integer("indicators_added").notNull().default(0),
  indicators_updated: integer("indicators_updated").notNull().default(0),
  indicators_skipped: integer("indicators_skipped").notNull().default(0),
  error_count: integer("error_count").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const exportHistoryTable = pgTable("export_history", {
  id: serial("id").primaryKey(),
  format: text("format").notNull(),
  indicator_count: integer("indicator_count").notNull().default(0),
  filters: jsonb("filters"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ImportHistory = typeof importHistoryTable.$inferSelect;
export type ExportHistory = typeof exportHistoryTable.$inferSelect;
