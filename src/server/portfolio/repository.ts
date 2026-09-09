import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { assets, portfolioPositions, portfolios } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export async function getPortfolioSnapshot(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return null;
  }

  const portfolioRow = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).limit(1);
  const portfolio = portfolioRow[0];
  if (!portfolio) {
    return null;
  }

  const positions = await db
    .select({
      asset: assets.symbol,
      quantity: portfolioPositions.quantity,
      averagePrice: portfolioPositions.averagePrice,
      marketValue: portfolioPositions.marketValue,
      unrealizedPnl: portfolioPositions.unrealizedPnl,
    })
    .from(portfolioPositions)
    .innerJoin(assets, eq(assets.id, portfolioPositions.assetId))
    .where(eq(portfolioPositions.portfolioId, portfolio.id));

  return {
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      status: portfolio.status,
    },
    positions,
  };
}

export async function ensurePortfolio(userId: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const existing = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).limit(1);
  if (existing[0]) {
    return existing[0];
  }

  const inserted = await db.insert(portfolios).values({ userId, name: "Primary", baseCurrency: "USD", status: "active" }).returning();
  return inserted[0] ?? null;
}
