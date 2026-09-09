import { NextResponse } from "next/server";
import { handleApiError } from "@/server/errors";
import { checkApiToken } from "@/server/api-token";

const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL ?? "http://127.0.0.1:8787";

async function fetchJson(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${MT5_BRIDGE_URL}${path}`, init);
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "MT5 bridge tidak dapat dijangkau" } };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") ?? "";
    const result = await fetchJson(`/positions${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`);
    if (!result.ok) {
      return NextResponse.json({ error: result.data?.detail ?? "Gagal mengambil posisi", status: "bridge_offline" }, { status: 502 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const tokenCheck = checkApiToken(request);
    if (!tokenCheck.allowed) {
      return NextResponse.json({ error: "Token akses tidak valid", code: tokenCheck.reason }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (body?.all === true) {
      const result = await fetchJson("/close-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviation: body.deviation ?? 20 }),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.data?.detail ?? "Gagal menutup semua posisi", status: "bridge_offline", results: [] }, { status: 502 });
      }
      return NextResponse.json(result.data);
    }

    const ticket = body?.ticket;
    if (!ticket) {
      return NextResponse.json({ error: "ticket posisi diperlukan (atau kirim { all: true })" }, { status: 400 });
    }
    const result = await fetchJson("/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, deviation: body.deviation ?? 20 }),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.data?.detail ?? "Gagal menutup posisi", status: "bridge_offline" }, { status: 502 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error);
  }
}