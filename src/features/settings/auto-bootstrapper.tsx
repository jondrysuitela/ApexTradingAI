"use client";

import { useEffect } from "react";

const BOOTSTRAP_KEY = "apex-workspace-bootstrapped";

export function AutoBootstrapper() {
  useEffect(() => {
    const hasBootstrapped = window.localStorage.getItem(BOOTSTRAP_KEY);
    if (hasBootstrapped === "true") {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch("/api/bootstrap", { method: "POST" });
        if (!cancelled && response.ok) {
          window.localStorage.setItem(BOOTSTRAP_KEY, "true");
        }
      } catch {
        // Silent by design: manual bootstrap stays available in Settings.
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
