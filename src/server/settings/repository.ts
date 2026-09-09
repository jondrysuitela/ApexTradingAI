import { eq } from "drizzle-orm";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

export type UserPreferences = {
  defaultSymbol: string;
  defaultTimeframe: string;
  riskPercent: string;
  maxDailyLoss: string;
  maxExposure: string;
  maxPositionSize: string;
  maxLeverage: string;
  openPositionsLimit: string;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultSymbol: "BTCUSDT",
  defaultTimeframe: "1h",
  riskPercent: "1.00",
  maxDailyLoss: "0",
  maxExposure: "0",
  maxPositionSize: "0",
  maxLeverage: "1",
  openPositionsLimit: "0",
};

export async function getUserPreferences(userId?: string): Promise<UserPreferences> {
  const db = getDb();
  if (!db || !userId) {
    return DEFAULT_USER_PREFERENCES;
  }

  const row = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (!row[0]) {
    return DEFAULT_USER_PREFERENCES;
  }

  return {
    defaultSymbol: row[0].defaultSymbol,
    defaultTimeframe: row[0].defaultTimeframe,
    riskPercent: row[0].riskPercent,
    maxDailyLoss: row[0].maxDailyLoss,
    maxExposure: row[0].maxExposure,
    maxPositionSize: row[0].maxPositionSize,
    maxLeverage: row[0].maxLeverage,
    openPositionsLimit: row[0].openPositionsLimit,
  };
}

export async function saveUserPreferences(userId: string, preferences: Partial<UserPreferences>) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const current = await getUserPreferences(userId);
  const next = { ...current, ...preferences };

  await db
    .insert(userPreferences)
    .values({
      userId,
      ...next,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        defaultSymbol: next.defaultSymbol,
        defaultTimeframe: next.defaultTimeframe,
        riskPercent: next.riskPercent,
        maxDailyLoss: next.maxDailyLoss,
        maxExposure: next.maxExposure,
        maxPositionSize: next.maxPositionSize,
        maxLeverage: next.maxLeverage,
        openPositionsLimit: next.openPositionsLimit,
        updatedAt: new Date(),
      },
    });

  return next;
}
