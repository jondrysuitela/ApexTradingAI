import { describe, expect, it } from "vitest";
import { computeAlert, registerAlertSnapshot, type AlertSnapshot, type AlertState } from "@/server/ai/alerts";

const BUY: AlertSnapshot = { action: "BUY", bias: "LONG", confidence: 72, reason: "Confluence kuat ke atas" };
const SELL: AlertSnapshot = { action: "SELL", bias: "SHORT", confidence: 65, reason: "Confluence kuat ke bawah" };
const WAIT: AlertSnapshot = { action: "WAIT", bias: "NEUTRAL", confidence: 20, reason: "Belum ada setup" };

const now = Date.now();

describe("ai alert transitions", () => {
  it("fires an alert on first registered signal", () => {
    const alert = computeAlert(null, BUY, "XAUUSD", "5m", now);
    expect(alert).not.toBeNull();
    expect(alert?.action).toBe("BUY");
    expect(alert?.symbol).toBe("XAUUSD");
  });

  it("does not fire when state is unchanged", () => {
    const previous: AlertState = { action: "BUY", confidence: 72, updatedAt: new Date(now).toISOString(), lastAlertId: "x", lastTransitionAt: new Date(now).toISOString() };
    const alert = computeAlert(previous, BUY, "XAUUSD", "5m", now + 60_000);
    expect(alert).toBeNull();
  });

  it("fires on hard flip BUY -> SELL even within cooldown", () => {
    const previous: AlertState = { action: "BUY", confidence: 72, updatedAt: new Date(now).toISOString(), lastAlertId: "x", lastTransitionAt: new Date(now).toISOString() };
    const alert = computeAlert(previous, SELL, "XAUUSD", "5m", now + 5_000);
    expect(alert).not.toBeNull();
    expect(alert?.action).toBe("SELL");
  });

  it("ignores weak WAIT spam but alerts on confidence jump", () => {
    const previous: AlertState = { action: "WAIT", confidence: 20, updatedAt: new Date(now).toISOString(), lastAlertId: "x", lastTransitionAt: new Date(now).toISOString() };
    expect(computeAlert(previous, WAIT, "XAUUSD", "5m", now + 60_000)).toBeNull();

    const strongWait: AlertSnapshot = { action: "WAIT", bias: "NEUTRAL", confidence: 55, reason: "Setup melemah" };
    expect(computeAlert(previous, strongWait, "XAUUSD", "5m", now + 200_000)).not.toBeNull();
  });

  it("respects cooldown for soft confidence changes", () => {
    const previous: AlertState = { action: "BUY", confidence: 72, updatedAt: new Date(now).toISOString(), lastAlertId: "x", lastTransitionAt: new Date(now).toISOString() };
    const bump: AlertSnapshot = { action: "BUY", bias: "LONG", confidence: 88, reason: "Makin kuat" };
    expect(computeAlert(previous, bump, "XAUUSD", "5m", now + 5_000)).toBeNull();
    expect(computeAlert(previous, bump, "XAUUSD", "5m", now + 200_000)).not.toBeNull();
  });
});

describe("alert store", () => {
  it("keeps history and latest alert across registrations", () => {
    const first = registerAlertSnapshot("XAUUSD", "5m", BUY, now);
    expect(first.latest?.action).toBe("BUY");
    expect(first.history.length).toBe(1);
    expect(first.state.action).toBe("BUY");

    const second = registerAlertSnapshot("XAUUSD", "5m", SELL, now + 120_000);
    expect(second.latest?.action).toBe("SELL");
    expect(second.history.length).toBe(2);
    expect(second.history[0].action).toBe("SELL");
  });
});