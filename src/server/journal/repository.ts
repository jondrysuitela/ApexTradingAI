import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { assets, journalEntries } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export async function getJournalEntries(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return [];
  }

  return db
    .select({
      id: journalEntries.id,
      symbol: journalEntries.symbol,
      direction: journalEntries.direction,
      strategy: journalEntries.strategy,
      reason: journalEntries.reason,
      result: journalEntries.result,
      notes: journalEntries.notes,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId));
}

export async function createJournalEntry(userId: string, input: { symbol: string; direction: string; strategy?: string; reason?: string; notes?: string }) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const asset = await db.select().from(assets).where(eq(assets.symbol, input.symbol)).limit(1);
  const inserted = await db
    .insert(journalEntries)
    .values({
      userId,
      assetId: asset[0]?.id ?? null,
      symbol: input.symbol,
      direction: input.direction,
      strategy: input.strategy ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return inserted[0] ?? null;
}
