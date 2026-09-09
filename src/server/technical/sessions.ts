export type SessionName = "OVERLAP" | "LONDON" | "NEW_YORK" | "TOKYO" | "SYDNEY" | "OFF_HOURS";
export type SessionLiquidity = "BEST" | "HIGH" | "GOOD" | "LOW" | "POOR";

export type MarketSession = {
  name: SessionName;
  label: string;
  liquidity: SessionLiquidity;
  block: boolean;
  note: string;
};

const WEEKEND: MarketSession = {
  name: "OFF_HOURS",
  label: "Akhir pekan",
  liquidity: "POOR",
  block: true,
  note: "Pasar forex tutup akhir pekan — jangan scalping.",
};

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function getMarketSession(date: Date = new Date()): MarketSession {
  if (isWeekend(date)) return WEEKEND;

  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60;

  if (hourUtc >= 12 && hourUtc < 16) {
    return { name: "OVERLAP", label: "Overlap London–New York", liquidity: "BEST", block: false, note: "Likuiditas tertinggi, spread terbaik — ideal untuk scalping." };
  }
  if (hourUtc >= 7 && hourUtc < 12) {
    return { name: "LONDON", label: "Sesi London", liquidity: "HIGH", block: false, note: "Likuiditas tinggi saat London buka — cocok untuk scalping." };
  }
  if (hourUtc >= 16 && hourUtc < 21) {
    return { name: "NEW_YORK", label: "Sesi New York", liquidity: "HIGH", block: false, note: "Likuiditas tinggi saat New York buka — cocok untuk scalping." };
  }
  if (hourUtc >= 0 && hourUtc < 9) {
    return { name: "TOKYO", label: "Sesi Tokyo/Asia", liquidity: "GOOD", block: false, note: "Likuiditas sedang — spread bisa melebar di pasangan non-JPY." };
  }
  if (hourUtc >= 21) {
    return { name: "SYDNEY", label: "Sesi Sydney", liquidity: "LOW", block: false, note: "Likuiditas tipis saat Sydney buka — spread biasanya melebar." };
  }

  return { name: "OFF_HOURS", label: "Off-hours", liquidity: "POOR", block: true, note: "Gap antar-sesi — likuiditas tipis, hindari scalping." };
}

export function sessionLiquidityLabel(liquidity: SessionLiquidity): string {
  switch (liquidity) {
    case "BEST": return "BEST";
    case "HIGH": return "HIGH";
    case "GOOD": return "GOOD";
    case "LOW": return "LOW";
    case "POOR": return "POOR";
  }
}