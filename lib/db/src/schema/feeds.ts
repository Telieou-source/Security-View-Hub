import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedsTable = pgTable("feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  feed_type: text("feed_type").notNull().default("other"),
  enabled: boolean("enabled").notNull().default(true),
  last_fetched: timestamp("last_fetched"),
  indicator_count: integer("indicator_count").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedSchema = createInsertSchema(feedsTable).omit({ id: true, created_at: true });
export type InsertFeed = z.infer<typeof insertFeedSchema>;
export type Feed = typeof feedsTable.$inferSelect;
