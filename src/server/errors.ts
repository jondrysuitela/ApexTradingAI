import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(message: string, public readonly statusCode = 500, public readonly code = "APP_ERROR") {
    super(message);
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message, code: "UNKNOWN_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown error", code: "UNKNOWN_ERROR" }, { status: 500 });
}
