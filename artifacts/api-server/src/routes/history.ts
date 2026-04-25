import { Router } from "express";
import { db, importHistoryTable, exportHistoryTable, indicatorsTable } from "@workspace/db";
import { desc, eq, count } from "drizzle-orm";

const router = Router();

router.get("/imports", async (_req, res) => {
  const rows = await db
    .select()
    .from(importHistoryTable)
    .orderBy(desc(importHistoryTable.created_at))
    .limit(100);
  res.json(rows);
});

router.delete("/imports/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [record] = await db
    .select()
    .from(importHistoryTable)
    .where(eq(importHistoryTable.id, id))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Import record not found" });
    return;
  }

  const [{ deleted_indicators }] = await db
    .delete(indicatorsTable)
    .where(eq(indicatorsTable.source_feed, record.source_name))
    .returning({ deleted_indicators: indicatorsTable.id })
    .then(rows => [{ deleted_indicators: rows.length }]);

  await db.delete(importHistoryTable).where(eq(importHistoryTable.id, id));

  res.json({ deleted_indicators, source_name: record.source_name });
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
