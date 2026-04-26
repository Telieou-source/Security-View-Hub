import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const indicatorsTable = pgTable("indicators", {
  id: serial("id").primaryKey(),
  indicator: text("indicator").notNull(),
  indicator_type: text("indicator_type").notNull(),
  source_feed: text("source_feed").notNull(),
  first_seen: text("first_seen"),
  last_seen: text("last_seen"),
  confidence: integer("confidence"),
  country: text("country"),
  description: text("description"),
  /** UUID shared by all indicators that came from the same CSV row — enables correlation lookups */
  correlation_id: text("correlation_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  indicatorIdx: index("indicator_idx").on(table.indicator),
  typeIdx: index("type_idx").on(table.indicator_type),
  feedIdx: index("feed_idx").on(table.source_feed),
  countryIdx: index("country_idx").on(table.country),
  correlationIdx: index("correlation_idx").on(table.correlation_id),
}));

export const insertIndicatorSchema = createInsertSchema(indicatorsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertIndicator = z.infer<typeof insertIndicatorSchema>;
export type Indicator = typeof indicatorsTable.$inferSelect;
