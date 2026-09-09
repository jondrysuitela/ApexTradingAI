import type { AIAnalysisInput, AIAnalysisOutput } from "./types";
import { buildFactsOnlyAnalysis } from "./providers/base";

const FACTOR_MAX = 6;
const RISK_MAX = 4;
const SCENARIO_MAX = 4;

export const GROUNDED_INSTRUCTIONS = `
Kamu adalah asisten analis pasar (gold/FX/crypto) yang TERTANGGUNG. Semua data yang boleh dipakai ada di pesan user di atas.
ATURAN TEGAS:
1. DILARANG mengarang angka/harga/level/persen apa pun yang tidak muncul di data yang diberikan. Semua klaim wajib merujuk data tersebut dan opsional mengutip nilainya PERSIS seperti yang diberikan (boleh mengutip presisi asli, jangan membulatkan seenaknya bila tersedia).
2. Jangan menambahkan isi berita di luar headline yang diberikan.
3. Jangan memberi perintah beli/jual ("rekomendasikan entry di..."). Kamu hanya menimbang fakta yang ada.
4. Keluarkan HANYA satu objek JSON valid (tanpa markdown, tanpa komentar penjelasan) dengan skema persis berikut:
{
  "summary": "string yang berisi 2-4 kalimat naratif berimbang; WAJIB menyebut arah confluence engine, skor /100, dan confidence % yang ada di data.",
  "verdict": "AGREE" atau "OVERRIDE",
  "bullishFactors": ["butir pendek merujuk data", ...],
  "bearishFactors": [...],
  "riskFactors": [...],
  "scenarioAnalysis": [...],
  "invalidation": "string"
}
5. Jumlah maksimal: bullishFactors 6, bearishFactors 6, riskFactors 4, scenarioAnalysis 4. Tiap butir satu kalimat pendek.
6. "verdict": pakai "AGREE" jika setuju dengan arah confluence engine; "OVERRIDE" jika data yang kamu timbang mendukung arah sebaliknya.
7. "scenarioAnalysis": maksimal 4 skenario singkat yang masuk akal dari data (mis. target tercapai, pembatalan level, sideways).
8. "invalidation": level pembatalan; WAJIB merujuk angka invalidation/stop-loss dari data yang diberikan. Jika tidak ada, isi string kosong "".
`.trim();

export function buildAnalysisPrompt(input: AIAnalysisInput): string {
  const i = input.indicators;
  const c = input.confluence;
  const s = input.setup;
  const sc = input.scalping;
  const news = input.newsContext;
  const lines: string[] = [];

  lines.push(`Analisa untuk: ${input.symbol} timeframe ${input.timeframe}. Close terakhir: ${input.latestClose ?? "n/a"}.`);
  lines.push(`Indikator: RSI ${i.rsi14?.toFixed(1) ?? "n/a"}, ATR ${i.atr14?.toFixed(1) ?? "n/a"}, EMA20 ${i.ema20 ?? "n/a"} vs SMA20 ${i.sma20 ?? "n/a"}.`);

  if (s) {
    lines.push(
      `Setup: state=${s.state}, score=${s.score}, tipe=${s.setupType}, arah=${s.direction}, entry zone ${s.entryZone ? `${s.entryZone.low}-${s.entryZone.high}` : "n/a"}, invalidation=${s.invalidation ?? "n/a"}, target=${s.targets?.length ? s.targets.join(",") : "n/a"}.`
    );
  }

  if (input.multiTimeframe) {
    lines.push(`Multi-timeframe alignment=${input.multiTimeframe.alignment} (L${input.multiTimeframe.longVotes}/S${input.multiTimeframe.shortVotes}/N${input.multiTimeframe.neutralVotes}).`);
  }

  if (input.confirmations?.length) {
    lines.push(`Frame konfirmasi: ${input.confirmations.map((f) => `${f.timeframe}=${f.bias}(${f.confidence})`).join(", ")}.`);
  }

  if (c) {
    lines.push(`Confluence engine: arah ${c.direction}, confidence ${c.confidence}%, skor ${c.score}/100. Regime: ${c.regime.regimeLabel}.`);
    if (c.factors?.length) {
      lines.push(`Faktor confluence: ${c.factors.filter((f) => f.score !== 0).map((f) => `${f.name} (w=${f.weight}, score=${f.score}) ${f.detail}`).join(" | ")}`);
    }
    if (c.narrative) lines.push(`Narasi engine: ${c.narrative}.`);
    const of = c.orderFlow;
    if (of) {
      const parts: string[] = [];
      if (of.vwap.vwap != null) parts.push(`VWAP ${of.vwap.vwap} (${of.vwap.position.replace("_", " ")}, deviasi ${of.vwap.deviationPct?.toFixed(2) ?? "n/a"}%)`);
      if (of.volumeProfile?.poc != null) parts.push(`POC ${of.volumeProfile.poc}, VAH ${of.volumeProfile.vah}, VAL ${of.volumeProfile.val}`);
      if (of.delta) parts.push(`delta ${(of.delta.imbalance * 100).toFixed(0)}% (${of.delta.cvdDirection}, momentum ${of.delta.aggressiveMomentum})`);
      if (of.sweeps?.length) parts.push(`sweep ${of.sweeps.map((w) => `${w.levelPrice}(${w.direction})`).join(",")}`);
      if (of.fvgs?.length) parts.push(`FVG ${of.fvgs.map((g) => `${Math.min(g.top, g.bottom)}-${Math.max(g.top, g.bottom)}(${g.direction})`).join(",")}`);
      if (of.orderBlocks?.length) parts.push(`OB ${of.orderBlocks.map((b) => `${Math.min(b.high, b.low)}-${Math.max(b.high, b.low)}(${b.direction})`).join(",")}`);
      if (parts.length) lines.push(`Order flow: ${parts.join("; ")}.`);
    }
    if (c.learning?.length) {
      lines.push(`Learning loop: ${c.learning.slice(0, 4).map((l) => `${l.name} ${l.edge >= 0 ? "+" : ""}${l.edge.toFixed(2)}R x${l.weight.toFixed(2)} (n=${l.samples}, win ${(l.winRate * 100).toFixed(0)}%)`).join(" | ")}`);
    }
  }

  if (input.strategyVote) {
    lines.push(`Strategy vote: ${input.strategyVote.agreeingCount}/${input.strategyVote.strategyCount} searah, lead=${input.strategyVote.topStrategy ?? "none"}. ${input.strategyVote.detail}`);
  }

  if (input.backtest && input.backtest.totalSignals >= 10) {
    lines.push(`Backtest: win ${input.backtest.winRate?.toFixed(0) ?? "n/a"}%, expectancy ${input.backtest.expectancyPct?.toFixed(3) ?? "n/a"}%, n=${input.backtest.totalSignals} (edge ${input.backtest.edge}).`);
  }

  if (sc) {
    lines.push(`Scalping: ${sc.direction}, confidence ${sc.confidence}, skor ${sc.score}, tipe ${sc.entryType}, volatilitas ${sc.volatility}, ATR% ${sc.atrPercent?.toFixed(2) ?? "n/a"}, gated=${sc.gated ? "YA" : "tidak"}. Saran: ${sc.suggestion}`);
  }

  if (news?.topHeadlines?.length) {
    lines.push(`Headline berita (sentimen dalam kurung): ${news.topHeadlines.slice(0, 6).map((h) => `[${h.sentiment}] ${h.title}`).join(" || ")}`);
  }

  if (news?.calendar?.nextHighImpact) {
    lines.push(`Event kalender mengemuka: ${news.calendar.nextHighImpact.event} (${news.calendar.nextHighImpact.importance}, ${news.calendar.nextHighImpact.currency}, forecast ${news.calendar.nextHighImpact.forecast ?? "n/a"}).`);
  }

  if (!c && !s && !sc) {
    lines.push("Tidak ada sinyal deterministik yang tersedia untuk TF ini.");
  }

  return lines.join("\n");
}

export type GroundedLLMOutput = {
  summary: string;
  verdict: "AGREE" | "OVERRIDE";
  bullishFactors: string[];
  bearishFactors: string[];
  riskFactors: string[];
  scenarioAnalysis: string[];
  invalidation: string;
};

export function parseGroundedJSON(text: string): GroundedLLMOutput | null {
  if (!text) return null;
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const isStr = (v: unknown): v is string => typeof v === "string";
  const strArr = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.filter(isStr).map((x) => x.trim()).filter(Boolean).slice(0, max) : [];
  return {
    summary: isStr(obj.summary) ? obj.summary.trim() : "",
    verdict: obj.verdict === "OVERRIDE" ? "OVERRIDE" : "AGREE",
    bullishFactors: strArr(obj.bullishFactors, FACTOR_MAX),
    bearishFactors: strArr(obj.bearishFactors, FACTOR_MAX),
    riskFactors: strArr(obj.riskFactors, RISK_MAX),
    scenarioAnalysis: strArr(obj.scenarioAnalysis, SCENARIO_MAX),
    invalidation: isStr(obj.invalidation) ? obj.invalidation.trim() : "",
  };
}

export function toAIAnalysisOutput(provider: string, input: AIAnalysisInput, parsed: GroundedLLMOutput): AIAnalysisOutput {
  const base = buildFactsOnlyAnalysis(provider, true, input);
  const direction = input.confluence?.direction ?? input.signal?.bias ?? "NEUTRAL";
  const score = input.confluence?.score ?? 0;
  const verdictNote = `Verdict AI: ${parsed.verdict} terhadap confluence ${direction} (skor ${score}/100).`;
  return {
    provider,
    connected: true,
    status: "CONNECTED",
    summary: `${parsed.summary || base.summary} ${verdictNote}`,
    bullishFactors: parsed.bullishFactors.length ? parsed.bullishFactors : base.bullishFactors,
    bearishFactors: parsed.bearishFactors.length ? parsed.bearishFactors : base.bearishFactors,
    riskFactors: parsed.riskFactors.length ? parsed.riskFactors : base.riskFactors,
    scenarioAnalysis: parsed.scenarioAnalysis.length ? parsed.scenarioAnalysis : base.scenarioAnalysis,
    invalidation: parsed.invalidation || base.invalidation,
  };
}

export async function postJSON<T = unknown>(apiUrl: string, headers: Record<string, string>, body: unknown, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}