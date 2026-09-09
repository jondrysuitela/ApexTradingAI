import Link from "next/link";
import { cn } from "@/lib/cn";
import { HealthStrip } from "@/features/system/health-strip";

const NAV = [
  "Dashboard",
  "AI Analyst",
  "Settings",
] as const;

export function AppShell({ active, children }: { active: string; children?: React.ReactNode }) {
  const isDashboard = active === "Dashboard";

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-cyan-300/80">Apex Trading Intelligence</div>
            <div className="text-lg font-semibold">Private market research workstation</div>
          </div>
          <HealthStrip />
        </div>
        <nav className="mx-auto flex max-w-[1600px] flex-wrap gap-2 px-6 pb-4">
          {NAV.map((item) => (
            <Link
              key={item}
              href={routeFor(item)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                item === active ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-300 hover:border-white/20",
              )}
            >
              {item}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {isDashboard ? <DashboardSurface /> : null}
        {children}
        {!isDashboard ? <div className="text-sm text-slate-400">Focused workspace. Use AI Analyst for market reading and Settings for setup.</div> : null}
      </main>
    </div>
  );
}

function DashboardSurface() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950 to-cyan-950/20 p-6 shadow-xl shadow-black/20">
        <div className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">AI Trading Assistant</div>
        <h1 className="mt-3 text-3xl font-semibold">Read market structure, get deterministic analysis, then ask AI for a concise trade view.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
          This workspace is now focused on analysis only. Use the AI Analyst page for symbol and timeframe review, and keep Settings for readiness and provider checks.
        </p>
      </section>
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20">
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Workspace Status</div>
          <div className="mt-3 text-lg font-semibold">Analysis-first mode</div>
          <div className="mt-2 text-sm text-slate-300">Markets, backtest, and other tools are available only if you decide to bring them back.</div>
        </div>
      </section>
    </div>
  );
}

function routeFor(label: string) {
  switch (label) {
    case "Dashboard":
      return "/dashboard";
    case "AI Analyst":
      return "/ai-analyst";
    case "Settings":
      return "/settings";
    default:
      return "/dashboard";
  }
}
