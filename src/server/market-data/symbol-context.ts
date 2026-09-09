export type SpreadContext = {
  points: number | null;
  point: number | null;
};

export async function getSpreadContext(symbol: string, bridgeUrl: string | undefined): Promise<SpreadContext | null> {
  if (!bridgeUrl) return null;

  try {
    const response = await fetch(`${bridgeUrl}/symbol?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as { spread?: number | null; point?: number | null };
    const points = typeof data.spread === "number" && Number.isFinite(data.spread) && data.spread >= 0 ? data.spread : null;
    const point = typeof data.point === "number" && Number.isFinite(data.point) && data.point > 0 ? data.point : null;
    return { points, point };
  } catch {
    return null;
  }
}