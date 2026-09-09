import { AppShell } from "@/components/app-shell";
import { AiTradingWorkspace } from "@/features/ai-analyst/ai-trading-workspace";

export default function AiAnalystPage() {
  return (
    <AppShell active="AI Analyst">
      <AiTradingWorkspace />
    </AppShell>
  );
}
