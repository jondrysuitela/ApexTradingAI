import fs from "node:fs";
import path from "node:path";
import { env } from "@/server/env";

const ACTIVE_DIR = path.join(process.cwd(), "data", "mt5");
const ACTIVE_FILE = path.join(ACTIVE_DIR, "active-bridge");

export function getConfiguredBridges(): string[] {
  const list = (env.MT5_BRIDGES ?? "")
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
  if (list.length > 0) {
    return [...new Set(list)];
  }
  if (env.MT5_BRIDGE_URL) {
    return [normalize(env.MT5_BRIDGE_URL)];
  }
  return [];
}

export function getActiveBridgeUrl(): string | null {
  const bridges = getConfiguredBridges();
  if (bridges.length === 0) return null;
  const saved = readActiveFile();
  if (saved) {
    const found = bridges.find((item) => item === saved);
    if (found) return found;
  }
  return bridges[0];
}

export function isBridgeConfigured(): boolean {
  return getConfiguredBridges().length > 0;
}

export function setActiveBridgeUrl(url: string): string | null {
  const normalized = normalize(url);
  const match = getConfiguredBridges().find((item) => item === normalized);
  if (!match) return null;
  writeActiveFile(match);
  return match;
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function readActiveFile(): string | null {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE, "utf-8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

function writeActiveFile(url: string) {
  try {
    fs.mkdirSync(ACTIVE_DIR, { recursive: true });
    fs.writeFileSync(ACTIVE_FILE, url, "utf-8");
  } catch {
    // read-only FS; in-memory default (first bridge) will still be used.
  }
}