const TOKEN = process.env.APP_TOKEN ?? "";

export function isApiTokenValid(token: string | null): boolean {
  return TOKEN.length > 0 && token !== null && token === TOKEN;
}

export function readApiToken(request: Request): string | null {
  const header = request.headers.get("x-app-token");
  if (header) return header;
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length);
  }
  return null;
}

export function apiTokenEnabled(): boolean {
  return TOKEN.length > 0;
}

export function checkApiToken(request: Request): { allowed: true } | { allowed: false; reason: string } {
  if (!TOKEN) return { allowed: true };
  const token = readApiToken(request);
  if (isApiTokenValid(token)) return { allowed: true };
  return { allowed: false, reason: "INVALID_OR_MISSING_TOKEN" };
}