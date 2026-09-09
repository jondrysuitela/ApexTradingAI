import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { handleApiError } from "@/server/errors";
import { getUserPreferences, saveUserPreferences } from "@/server/settings/repository";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ preferences: await getUserPreferences(user?.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, string>;
    const preferences = {
      defaultSymbol: body.defaultSymbol,
      defaultTimeframe: body.defaultTimeframe,
      riskPercent: body.riskPercent,
      maxDailyLoss: body.maxDailyLoss,
      maxExposure: body.maxExposure,
      maxPositionSize: body.maxPositionSize,
      maxLeverage: body.maxLeverage,
      openPositionsLimit: body.openPositionsLimit,
    };

    return NextResponse.json({ preferences: await saveUserPreferences(user.id, preferences) });
  } catch (error) {
    return handleApiError(error);
  }
}
