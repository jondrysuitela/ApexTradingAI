import { eq } from "drizzle-orm";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { DEFAULT_MARKET_UNIVERSE } from "@/server/market-data/universe";
import { DEFAULT_USER_PREFERENCES, saveUserPreferences } from "@/server/settings/repository";
import { assets, paperAccounts, portfolios, profiles, users, watchlistAssets, watchlists } from "@/server/db/schema";

export async function getBootstrapStatus(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return { connected: false, complete: false, checks: null };
  }

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const portfolioRows = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).limit(1);
  const paperAccountRows = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const watchlistRows = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(1);

  const checks = {
    profile: Boolean(profileRows[0]),
    portfolio: Boolean(portfolioRows[0]),
    paperAccount: Boolean(paperAccountRows[0]),
    watchlist: Boolean(watchlistRows[0]),
  };

  return { connected: true, complete: Object.values(checks).every(Boolean), checks };
}

export async function bootstrapUserWorkspace(userId: string, email: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const createdAt = new Date();

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0]) {
    await db.insert(users).values({ id: userId, email, createdAt, updatedAt: createdAt });
  }

  await db
    .insert(profiles)
    .values({ userId, displayName: email.split("@")[0] ?? null, timezone: "UTC", createdAt, updatedAt: createdAt })
    .onConflictDoNothing({ target: profiles.userId });

  await saveUserPreferences(userId, DEFAULT_USER_PREFERENCES);

  const portfolioRows = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).limit(1);
  if (!portfolioRows[0]) {
    await db.insert(portfolios).values({ userId, name: "Primary", baseCurrency: "USD", status: "active", createdAt, updatedAt: createdAt });
  }

  const paperAccountRows = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  if (!paperAccountRows[0]) {
    await db.insert(paperAccounts).values({ userId, name: "Primary Paper Account", baseCurrency: "USD", createdAt, updatedAt: createdAt });
  }

  const watchlistRows = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(1);
  let watchlistId = watchlistRows[0]?.id;
  if (!watchlistId) {
    const insertedWatchlist = await db.insert(watchlists).values({ userId, name: "Primary", createdAt }).returning({ id: watchlists.id });
    watchlistId = insertedWatchlist[0]?.id;
  }

  if (watchlistId) {
    for (const item of DEFAULT_MARKET_UNIVERSE.slice(0, 5)) {
      const assetRows = await db.select().from(assets).where(eq(assets.symbol, item.symbol)).limit(1);
      let assetId = assetRows[0]?.id;

      if (!assetId) {
        const insertedAsset = await db
          .insert(assets)
          .values({ symbol: item.symbol, baseAsset: item.symbol.replace(/USDT$/, ""), quoteAsset: "USDT", assetClass: item.market, isActive: true, createdAt })
          .returning({ id: assets.id });
        assetId = insertedAsset[0]?.id;
      }

      if (assetId) {
        await db
          .insert(watchlistAssets)
          .values({ watchlistId, assetId, createdAt })
          .onConflictDoNothing({ target: [watchlistAssets.watchlistId, watchlistAssets.assetId] });
      }
    }
  }

  return {
    ok: true,
    createdDefaults: {
      preferences: DEFAULT_USER_PREFERENCES,
      watchlist: Boolean(watchlistId),
      portfolio: true,
      paperAccount: true,
      profile: true,
    },
  };
}
