import { Router } from "express";
import { db, importHistoryTable, exportHistoryTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/imports", async (_req, res) => {
  const rows = await db
    .select()
    .from(importHistoryTable)
    .orderBy(desc(importHistoryTable.created_at))
    .limit(100);
  res.json(rows);
});

router.get("/exports", async (_req, res) => {
  const rows = await db
    .select()
    .from(exportHistoryTable)
    .orderBy(desc(exportHistoryTable.created_at))
    .limit(100);
  res.json(rows);
});

export default router;
