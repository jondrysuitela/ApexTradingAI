import { NextResponse } from "next/server";
import { getMarketDataHealth } from "@/server/market-data/health";

export async function GET() {
  const health = await getMarketDataHealth();
  return NextResponse.json(health);
}
