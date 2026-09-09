import { AppShell } from "@/components/app-shell";
import { HealthMonitoring } from "@/features/settings/health-monitoring";
import { ProviderSettings } from "@/features/settings/provider-settings";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "@/features/settings/settings-form";
import { ReadinessPanel } from "@/features/settings/readiness-panel";

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <div className="grid gap-6 xl:grid-cols-2">
        <ProviderSettings />
        <HealthMonitoring />
        <ReadinessPanel />
        <SettingsForm />
        <Card className="xl:col-span-2">
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Risk Limits</div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <p>Maximum risk per trade: NOT CONFIGURED</p>
            <p>Maximum daily loss: NOT CONFIGURED</p>
            <p>Maximum exposure: NOT CONFIGURED</p>
            <p>Maximum position size: NOT CONFIGURED</p>
            <p>Maximum leverage: NOT CONFIGURED</p>
            <p>Open positions limit: NOT CONFIGURED</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
