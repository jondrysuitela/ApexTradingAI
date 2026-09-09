import { NextResponse } from "next/server";
import { getReadinessStatus } from "@/server/system/readiness";

export async function GET() {
  return NextResponse.json(getReadinessStatus());
}
