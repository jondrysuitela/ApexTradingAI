import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getCurrentUserId } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import {
  createPaperOrder,
  ensurePaperAccount,
  getPaperTradingSnapshot,
  processPaperOrders,
  refreshPaperPositionMarks,
} from "@/server/paper-trading/repository";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const snapshot = await getPaperTradingSnapshot(userId);
  return NextResponse.json({ snapshot });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!getDb()) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const action = String(body.action ?? "create-order");

    if (action === "ensure-account") {
      const account = await ensurePaperAccount(userId);
      return NextResponse.json({ account });
    }

    if (action === "process-orders") {
      const result = await processPaperOrders(userId);
      return NextResponse.json(result);
    }

    if (action === "refresh-marks") {
      const result = await refreshPaperPositionMarks(userId);
      return NextResponse.json(result);
    }

    const side = String(body.side ?? "buy");
    if (side !== "buy" && side !== "sell") {
      return NextResponse.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }

    const orderType = String(body.orderType ?? "market");
    if (orderType !== "market" && orderType !== "limit" && orderType !== "stop") {
      return NextResponse.json({ error: "orderType must be market, limit or stop" }, { status: 400 });
    }

    const quantity = String(body.quantity ?? "0.01");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
    }

    const order = await createPaperOrder(userId, {
      symbol: String(body.symbol ?? "XAUUSD"),
      side,
      orderType,
      quantity,
      limitPrice: body.limitPrice == null ? null : String(body.limitPrice),
      stopPrice: body.stopPrice == null ? null : String(body.stopPrice),
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}