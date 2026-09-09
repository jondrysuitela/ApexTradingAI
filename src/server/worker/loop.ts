import { evaluateAlerts } from "@/server/alerts/repository";

export async function runWorkerCycle(userId?: string) {
  const results = {
    alerts: { processed: 0, triggered: 0 },
  };

  if (!userId) {
    return results;
  }

  const alertResult = await evaluateAlerts(userId);
  results.alerts.processed = alertResult.processed;
  results.alerts.triggered = alertResult.triggered;

  return results;
}