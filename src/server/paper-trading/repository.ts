import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getTicker } from "@/server/market-data/service";
import { paperAccounts, paperOrders, paperPositions } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export async function getPaperTradingSnapshot(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return null;
  }

  const accountRows = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  const account = accountRows[0];
  if (!account) {
    return null;
  }

  const orders = await db.select().from(paperOrders).where(eq(paperOrders.accountId, account.id));
  const positions = await db.select().from(paperPositions).where(eq(paperPositions.accountId, account.id));
  const history = orders
    .filter((order) => order.status === "filled")
    .sort((left, right) => right.filledAt!.getTime() - left.filledAt!.getTime())
    .map((order) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      quantity: order.quantity,
      filledPrice: order.filledPrice,
      realizedPnl: order.realizedPnl,
      filledAt: order.filledAt ? order.filledAt.toISOString() : null,
    }));

  return {
    account,
    orders,
    positions,
    history,
    summary: buildPaperTradingSummary(account, history),
  };
}

export function buildPaperTradingSummary(
  account: { balance: unknown; equity: unknown; realizedPnl: unknown },
  history: Array<{ side: string; quantity: string; filledPrice: unknown; realizedPnl: unknown; filledAt: string | null }>,
) {
  const trades = history.length;
  const wins = history.filter((trade) => Number(trade.realizedPnl) > 0).length;
  const grossVolume = history.reduce((total, trade) => total + Number(trade.quantity) * Number(trade.filledPrice), 0);

  return {
    balance: String(account.balance),
    equity: String(account.equity),
    realizedPnl: String(account.realizedPnl),
    trades,
    wins,
    winRate: trades ? ((wins / trades) * 100).toFixed(2) : "0.00",
    grossVolume: grossVolume.toFixed(2),
    lastTradeAt: history[0]?.filledAt ?? null,
  };
}

export async function ensurePaperAccount(userId: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const existing = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(paperAccounts).values({ userId, name: "Primary Paper Account", baseCurrency: "USD" }).returning();
  return inserted[0] ?? null;
}

export async function createPaperOrder(
  userId: string,
  input: { symbol: string; side: "buy" | "sell"; orderType: "market" | "limit" | "stop"; quantity: string; limitPrice?: string | null; stopPrice?: string | null },
) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const account = await ensurePaperAccount(userId);
  if (!account) {
    throw new AppError("Paper account unavailable", 500, "PAPER_ACCOUNT_UNAVAILABLE");
  }

  const inserted = await db
    .insert(paperOrders)
    .values({
      accountId: account.id,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      status: "open",
    })
    .returning();

  return inserted[0] ?? null;
}

export async function processPaperOrders(userId: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const account = await ensurePaperAccount(userId);
  if (!account) {
    throw new AppError("Paper account unavailable", 500, "PAPER_ACCOUNT_UNAVAILABLE");
  }
  const accountState = { balance: Number(account.balance), realizedPnl: Number(account.realizedPnl) };

  const openOrders = await db.select().from(paperOrders).where(eq(paperOrders.accountId, account.id));
  const fillResults: Array<{ orderId: string; status: string; filledPrice: number }> = [];

  for (const order of openOrders) {
    if (order.status !== "open") continue;

    let lastPrice: number | null = null;
    if (order.orderType === "market" || order.orderType === "limit" || order.orderType === "stop") {
      try {
        const ticker = await getTicker(order.symbol);
        lastPrice = ticker.price;
      } catch {
        lastPrice = null;
      }
    }

    const fillPrice = determinePaperFillPrice(order.orderType, order.side, lastPrice, order.limitPrice, order.stopPrice);
    if (fillPrice === null) {
      continue;
    }

    await db.transaction(async (tx) => {
      const positionRows = await tx.select().from(paperPositions).where(eq(paperPositions.accountId, account.id));
      const existingPosition = positionRows.find((position) => position.symbol === order.symbol);
      const tradeQty = Number(order.quantity);
      const signedTradeQty = order.side === "buy" ? tradeQty : -tradeQty;
      const currentQty = existingPosition ? Number(existingPosition.quantity) : 0;
      const currentAvg = existingPosition ? Number(existingPosition.averagePrice) : 0;

      const next = applyPaperTrade(currentQty, currentAvg, signedTradeQty, fillPrice);

      await tx
        .update(paperOrders)
        .set({ status: "filled", filledPrice: fillPrice.toString(), realizedPnl: next.realizedPnl.toString(), filledAt: new Date(), updatedAt: new Date() })
        .where(eq(paperOrders.id, order.id));

      if (!existingPosition) {
        await tx.insert(paperPositions).values({
          accountId: account.id,
          symbol: order.symbol,
          quantity: next.quantity.toString(),
          averagePrice: next.averagePrice.toString(),
          unrealizedPnl: "0",
        });
      } else {
        await tx
          .update(paperPositions)
          .set({
            quantity: next.quantity.toString(),
            averagePrice: next.averagePrice.toString(),
            unrealizedPnl: "0",
            updatedAt: new Date(),
          })
          .where(eq(paperPositions.id, existingPosition.id));
      }

      const nextAccount = applyPaperAccountFill(accountState, signedTradeQty, fillPrice, next.realizedPnl);
      accountState.balance = nextAccount.balance;
      accountState.realizedPnl = nextAccount.realizedPnl;

      await tx
        .update(paperAccounts)
        .set({
          balance: nextAccount.balance.toString(),
          realizedPnl: nextAccount.realizedPnl.toString(),
          equity: nextAccount.equity.toString(),
          updatedAt: new Date(),
        })
        .where(eq(paperAccounts.id, account.id));
    });

    fillResults.push({ orderId: order.id, status: "filled", filledPrice: fillPrice });
  }

  return { processed: fillResults.length, fillResults };
}

export async function refreshPaperPositionMarks(userId: string) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const account = await ensurePaperAccount(userId);
  if (!account) {
    throw new AppError("Paper account unavailable", 500, "PAPER_ACCOUNT_UNAVAILABLE");
  }

  const positions = await db.select().from(paperPositions).where(eq(paperPositions.accountId, account.id));
  let totalUnrealizedPnl = 0;
  let refreshed = 0;

  for (const position of positions) {
    const quantity = Number(position.quantity);
    if (quantity === 0) continue;

    let markPrice: number;
    try {
      markPrice = (await getTicker(position.symbol)).price;
    } catch {
      totalUnrealizedPnl += Number(position.unrealizedPnl);
      continue;
    }

    const averagePrice = Number(position.averagePrice);
    const unrealizedPnl = quantity > 0 ? (markPrice - averagePrice) * quantity : (averagePrice - markPrice) * Math.abs(quantity);
    totalUnrealizedPnl += unrealizedPnl;
    refreshed += 1;

    await db
      .update(paperPositions)
      .set({ markPrice: markPrice.toString(), unrealizedPnl: unrealizedPnl.toString(), markedAt: new Date(), updatedAt: new Date() })
      .where(eq(paperPositions.id, position.id));
  }

  const updatedEquity = Number(account.balance) + Number(account.realizedPnl) + totalUnrealizedPnl;
  await db.update(paperAccounts).set({ equity: updatedEquity.toString(), updatedAt: new Date() }).where(eq(paperAccounts.id, account.id));

  return { processed: positions.length, refreshed, totalUnrealizedPnl };
}

export function determinePaperFillPrice(
  orderType: "market" | "limit" | "stop",
  side: "buy" | "sell",
  lastPrice: number | null,
  limitPrice: unknown,
  stopPrice: unknown,
) {
  if (orderType === "market") {
    return lastPrice;
  }

  const limit = limitPrice == null ? null : Number(limitPrice);
  const stop = stopPrice == null ? null : Number(stopPrice);

  if (!lastPrice) {
    return null;
  }

  if (orderType === "limit" && limit != null) {
    return side === "buy" ? (lastPrice <= limit ? lastPrice : null) : lastPrice >= limit ? lastPrice : null;
  }

  if (orderType === "stop" && stop != null) {
    return side === "buy" ? (lastPrice >= stop ? lastPrice : null) : lastPrice <= stop ? lastPrice : null;
  }

  return null;
}

export function applyPaperTrade(currentQty: number, currentAvg: number, signedTradeQty: number, fillPrice: number) {
  if (currentQty === 0) {
    return { quantity: signedTradeQty, averagePrice: Math.abs(signedTradeQty) > 0 ? fillPrice : 0, realizedPnl: 0 };
  }

  const sameDirection = Math.sign(currentQty) === Math.sign(signedTradeQty);
  if (sameDirection) {
    const nextQty = currentQty + signedTradeQty;
    const weightedAvg = (Math.abs(currentQty) * currentAvg + Math.abs(signedTradeQty) * fillPrice) / Math.abs(nextQty);
    return { quantity: nextQty, averagePrice: weightedAvg, realizedPnl: 0 };
  }

  const closingQty = Math.min(Math.abs(currentQty), Math.abs(signedTradeQty));
  const remainingQty = currentQty + signedTradeQty;

  if (currentQty > 0 && signedTradeQty < 0) {
    const realizedPnl = (fillPrice - currentAvg) * closingQty;
    if (remainingQty > 0) {
      return { quantity: remainingQty, averagePrice: currentAvg, realizedPnl };
    }

    if (remainingQty < 0) {
      return { quantity: remainingQty, averagePrice: fillPrice, realizedPnl };
    }

    return { quantity: 0, averagePrice: 0, realizedPnl };
  }

  const realizedPnl = (currentAvg - fillPrice) * closingQty;
  if (remainingQty < 0) {
    return { quantity: remainingQty, averagePrice: currentAvg, realizedPnl };
  }

  if (remainingQty > 0) {
    return { quantity: remainingQty, averagePrice: fillPrice, realizedPnl };
  }

  return { quantity: 0, averagePrice: 0, realizedPnl };
}

export function applyPaperAccountFill(account: { balance: number; realizedPnl: number }, signedTradeQty: number, fillPrice: number, realizedPnlDelta: number, unrealizedPnl = 0) {
  const balance = account.balance - signedTradeQty * fillPrice;
  const realizedPnl = account.realizedPnl + realizedPnlDelta;
  return { balance, realizedPnl, equity: balance + realizedPnl + unrealizedPnl };
}
