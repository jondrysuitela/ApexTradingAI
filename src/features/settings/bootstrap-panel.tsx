"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

export function BootstrapPanel() {
  const [status, setStatus] = useState<string>("NOT CONNECTED");

  async function bootstrap() {
    const response = await fetch("/api/bootstrap", { method: "POST" });
    if (response.ok) {
      setStatus("BOOTSTRAPPED");
      return;
    }

    setStatus("FAILED");
  }

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">First Run Setup</div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">Creates default workspace records for the signed-in user.</div>
          <div className="mt-1 text-xs text-slate-500">Status: {status}</div>
        </div>
        <button onClick={bootstrap} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
          Bootstrap Workspace
        </button>
      </div>
    </Card>
  );
}
