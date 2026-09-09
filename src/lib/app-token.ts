export const appToken: string = process.env.NEXT_PUBLIC_APP_TOKEN ?? "";

export function appTokenHeaders(): Record<string, string> {
  return appToken ? { "x-app-token": appToken } : {};
}