import { evaluateAlerts } from "@/server/alerts/repository";
import { getDb } from "@/server/db/client";
import { paperAccounts, paperOrders } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { processPaperOrders, refreshPaperPositionMarks } from "@/server/paper-trading/repository";

export async function runWorkerCycle(userId?: string) {
  const results = {
    alerts: { processed: 0, triggered: 0 },
    paperTrading: { processed: 0, filled: 0, marked: 0 },
  };

  if (!userId) {
    return results;
  }

  const alertResult = await evaluateAlerts(userId);
  results.alerts.processed = alertResult.processed;
  results.alerts.triggered = alertResult.triggered;

  const paperResult = await processPaperOrders(userId);
  results.paperTrading.processed = paperResult.processed;
  results.paperTrading.filled = paperResult.fillResults.length;

  const markResult = await refreshPaperPositionMarks(userId);
  results.paperTrading.marked = markResult.refreshed;

  return results;
}

export async function getWorkerSnapshot(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return null;
  }

  const accountRows = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const account = accountRows[0] ?? null;
  const openOrders = account ? await db.select().from(paperOrders).where(eq(paperOrders.accountId, account.id)) : [];

  return {
    connected: Boolean(account),
    openPaperOrders: openOrders.filter((order) => order.status === "open").length,
    filledPaperOrders: openOrders.filter((order) => order.status === "filled").length,
  };
}
