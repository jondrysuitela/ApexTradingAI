import { NextResponse } from "next/server";
import { getAIHealth } from "@/server/ai/health";

export async function GET() {
  return NextResponse.json(await getAIHealth());
}
