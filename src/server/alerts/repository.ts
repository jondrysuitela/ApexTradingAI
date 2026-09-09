import { eq } from "drizzle-orm";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { alertNotifications, alerts } from "@/server/db/schema";
import { getTicker } from "@/server/market-data/service";

export type AlertItem = {
  id: string;
  symbol: string;
  alertType: string;
  channel: string;
  threshold: string | null;
  timeframe: string | null;
  status: string;
  lastTriggeredAt: string | null;
  lastTriggeredValue: string | null;
};

export type AlertCreateInput = {
  symbol: string;
  alertType: string;
  channel: string;
  threshold: string | null;
  timeframe: string | null;
};

export type AlertNotificationItem = {
  id: string;
  alertId: string | null;
  symbol: string;
  alertType: string;
  channel: string;
  triggerValue: string;
  message: string;
  createdAt: string;
};

export async function getAlerts(userId?: string): Promise<AlertItem[]> {
  const db = getDb();
  if (!db || !userId) {
    return [];
  }

  const rows = await db.select().from(alerts).where(eq(alerts.userId, userId));
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    alertType: row.alertType,
    channel: row.channel,
    threshold: row.threshold,
    timeframe: row.timeframe,
    status: row.status,
    lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
    lastTriggeredValue: row.lastTriggeredValue,
  }));
}

export async function getAlertNotifications(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return [] as AlertNotificationItem[];
  }

  const rows = await db.select().from(alertNotifications).where(eq(alertNotifications.userId, userId));
  return rows
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      alertId: row.alertId,
      symbol: row.symbol,
      alertType: row.alertType,
      channel: row.channel,
      triggerValue: row.triggerValue,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }));
}

export async function createAlert(userId: string, input: AlertCreateInput) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database is not configured", 503, "DATABASE_NOT_CONNECTED");
  }

  const inserted = await db
    .insert(alerts)
    .values({
      userId,
      symbol: input.symbol,
      alertType: input.alertType as never,
      channel: input.channel as never,
      threshold: input.threshold,
      timeframe: input.timeframe,
      status: "active",
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new AppError("Failed to create alert", 500, "ALERT_CREATE_FAILED");
  }

  return {
    id: row.id,
    symbol: row.symbol,
    alertType: row.alertType,
    channel: row.channel,
    threshold: row.threshold,
    timeframe: row.timeframe,
    status: row.status,
    lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
    lastTriggeredValue: row.lastTriggeredValue,
  };
}

export async function evaluateAlerts(userId?: string) {
  const db = getDb();
  if (!db || !userId) {
    return { processed: 0, triggered: 0, matches: [] as Array<{ alertId: string; symbol: string; price: number }> };
  }

  const rows = await db.select().from(alerts).where(eq(alerts.userId, userId));
  const activeAlerts = rows.filter((row) => row.status === "active");
  const matches: Array<{ alertId: string; symbol: string; price: number }> = [];

  for (const alert of activeAlerts) {
    const threshold = alert.threshold == null ? null : Number(alert.threshold);
    if (threshold == null) continue;

    let price: number;
    try {
      price = (await getTicker(alert.symbol)).price;
    } catch {
      continue;
    }

    if (!matchesAlert(alert.alertType, price, threshold)) continue;

    matches.push({ alertId: alert.id, symbol: alert.symbol, price });

    await db
      .update(alerts)
      .set({
        status: "triggered",
        lastTriggeredAt: new Date(),
        lastTriggeredValue: price.toString(),
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, alert.id));

    await db.insert(alertNotifications).values({
      userId,
      alertId: alert.id,
      symbol: alert.symbol,
      alertType: alert.alertType,
      channel: alert.channel,
      triggerValue: price.toString(),
      message: `${alert.symbol} ${alert.alertType} triggered at ${price.toFixed(2)}`,
    });
  }

  return { processed: activeAlerts.length, triggered: matches.length, matches };
}

function matchesAlert(alertType: string, price: number, threshold: number) {
  switch (alertType) {
    case "price":
    case "breakout":
      return price >= threshold;
    case "breakdown":
      return price <= threshold;
    default:
      return false;
  }
}
