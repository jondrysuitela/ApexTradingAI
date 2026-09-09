import { eq } from "drizzle-orm";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { assets, watchlistAssets, watchlists } from "@/server/db/schema";
import { DEFAULT_MARKET_UNIVERSE } from "@/server/market-data/universe";

export type WatchlistItem = { symbol: string; label: string };

export async function getWatchlistItems(userId?: string): Promise<WatchlistItem[]> {
  const db = getDb();
  if (!db || !userId) {
    return DEFAULT_MARKET_UNIVERSE.slice(0, 5).map((item) => ({ symbol: item.symbol, label: item.label }));
  }

  const rows = await db
    .select({ symbol: assets.symbol, label: assets.symbol })
    .from(watchlists)
    .innerJoin(watchlistAssets, eq(watchlistAssets.watchlistId, watchlists.id))
    .innerJoin(assets, eq(assets.id, watchlistAssets.assetId))
    .where(eq(watchlists.userId, userId));

  return rows.length ? rows : DEFAULT_MARKET_UNIVERSE.slice(0, 5).map((item) => ({ symbol: item.symbol, label: item.label }));
}

export async function addWatchlistSymbol(userId: string, symbol: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const asset = DEFAULT_MARKET_UNIVERSE.find((item) => item.symbol === symbol);
  if (!asset) {
    throw new AppError("Unknown symbol", 400, "UNKNOWN_SYMBOL");
  }

  const existingAsset = await db.select().from(assets).where(eq(assets.symbol, symbol)).limit(1);
  let assetId = existingAsset[0]?.id;

  if (!assetId) {
    const inserted = await db
      .insert(assets)
      .values({ symbol: asset.symbol, baseAsset: asset.symbol.replace(/USDT$/, ""), quoteAsset: "USDT", assetClass: "crypto", isActive: true })
      .returning({ id: assets.id });
    assetId = inserted[0]?.id;
  }

  if (!assetId) {
    throw new AppError("Failed to create asset", 500, "ASSET_CREATE_FAILED");
  }

  const existingWatchlist = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(1);
  let watchlistId = existingWatchlist[0]?.id;

  if (!watchlistId) {
    const insertedWatchlist = await db.insert(watchlists).values({ userId, name: "Primary" }).returning({ id: watchlists.id });
    watchlistId = insertedWatchlist[0]?.id;
  }

  if (!watchlistId) {
    throw new AppError("Failed to create watchlist", 500, "WATCHLIST_CREATE_FAILED");
  }

  await db
    .insert(watchlistAssets)
    .values({ watchlistId, assetId })
    .onConflictDoNothing({ target: [watchlistAssets.watchlistId, watchlistAssets.assetId] });

  return { ok: true };
}
