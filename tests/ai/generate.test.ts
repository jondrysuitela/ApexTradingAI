import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt, GROUNDED_INSTRUCTIONS, parseGroundedJSON, toAIAnalysisOutput } from "@/server/ai/generate";
import type { AIAnalysisInput } from "@/server/ai/types";

const baseInput: AIAnalysisInput = {
  symbol: "XAUUSD",
  timeframe: "5m",
  latestClose: 2350.5,
  indicators: { sma20: 2348.0, ema20: 2349.2, rsi14: 58.3, atr14: 4.2 },
  structure: [],
  supportResistance: [],
  setup: null,
};

describe("parseGroundedJSON", () => {
  it("memakai JSON polos", () => {
    const out = parseGroundedJSON(
      '{"summary":"Narasi","verdict":"AGREE","bullishFactors":["RSI 58"],"bearishFactors":[],"riskFactors":["Volatilitas EXTREME"],"scenarioAnalysis":["Skenario 1"],"invalidation":"2350.0"}'
    );
    expect(out).not.toBeNull();
    expect(out!.summary).toBe("Narasi");
    expect(out!.verdict).toBe("AGREE");
    expect(out!.bullishFactors).toEqual(["RSI 58"]);
    expect(out!.invalidation).toBe("2350.0");
  });

  it("menghapus code fence markdown", () => {
    const out = parseGroundedJSON(
      '```json\n{"summary":"x","verdict":"OVERRIDE","bullishFactors":["a"],"bearishFactors":["b"],"riskFactors":["c"],"scenarioAnalysis":["d"],"invalidation":""}\n```'
    );
    expect(out!.verdict).toBe("OVERRIDE");
  });

  it("clamp array ke batas max dan membuang nilai non-string", () => {
    const big = Array.from({ length: 12 }, (_, i) => `f${i}`);
    const out = parseGroundedJSON(
      JSON.stringify({
        summary: "s",
        verdict: "AGREE",
        bullishFactors: [...big, { bad: 1 }, null, 42],
        bearishFactors: [],
        riskFactors: [],
        scenarioAnalysis: [],
        invalidation: "",
      })
    );
    expect(out!.bullishFactors.length).toBe(6);
  });

  it("verdict tidak valid default AGREE; teks non-JSON → null", () => {
    expect(parseGroundedJSON("tidak ada json")).toBeNull();
    expect(parseGroundedJSON("")).toBeNull();
    const out = parseGroundedJSON(
      '{"summary":"s","verdict":"GILA","bullishFactors":[],"bearishFactors":[],"riskFactors":[],"scenarioAnalysis":[],"invalidation":""}'
    );
    expect(out!.verdict).toBe("AGREE");
  });
});

describe("toAIAnalysisOutput", () => {
  it("membungkus verdict di summary dan melewati faktor LLM", () => {
    const input: AIAnalysisInput = {
      ...baseInput,
      confluence: {
        score: 72,
        direction: "LONG",
        confidence: 68,
        factors: [],
        regime: { trend: "up", volatility: "normal", momentum: "up", regimeLabel: "Trend naik" },
        narrative: "N",
      },
    };
    const out = toAIAnalysisOutput("openai", input, {
      summary: "Analisis berimbang.",
      verdict: "AGREE",
      bullishFactors: ["Faktor bull LLM"],
      bearishFactors: ["Faktor bear LLM"],
      riskFactors: ["Risiko LLM"],
      scenarioAnalysis: ["Skenario LLM"],
      invalidation: "3000",
    });
    expect(out.status).toBe("CONNECTED");
    expect(out.provider).toBe("openai");
    expect(out.summary).toContain("Analisis berimbang.");
    expect(out.summary).toContain("Verdict AI: AGREE terhadap confluence LONG (skor 72/100).");
    expect(out.bullishFactors).toEqual(["Faktor bull LLM"]);
    expect(out.invalidation).toBe("3000");
  });

  it("array kosong dari LLM → fallback ke fakta deterministik", () => {
    const input: AIAnalysisInput = {
      ...baseInput,
      indicators: { sma20: 2348.0, ema20: 2349.2, rsi14: 50.0, atr14: 4.2 },
      supportResistance: [
        { price: 2400, type: "resistance", strength: 2, touchCount: 2, lastReaction: "2026-09-09T10:00:00Z", distanceFromCurrentPrice: 2.1 },
      ],
      confluence: {
        score: 40,
        direction: "SHORT",
        confidence: 50,
        factors: [],
        regime: { trend: "down", volatility: "normal", momentum: "down", regimeLabel: "Trend turun" },
        narrative: "N",
      },
    };
    const out = toAIAnalysisOutput("openai", input, {
      summary: "",
      verdict: "OVERRIDE",
      bullishFactors: [],
      bearishFactors: [],
      riskFactors: [],
      scenarioAnalysis: [],
      invalidation: "",
    });
    expect(out.summary).toContain("Verdict AI: OVERRIDE terhadap confluence SHORT (skor 40/100).");
    expect(out.bullishFactors.length).toBeGreaterThan(0);
    expect(out.bearishFactors.length).toBeGreaterThan(0);
  });
});

describe("buildAnalysisPrompt", () => {
  it("berisi simbol, timeframe, dan skor confluence", () => {
    const prompt = buildAnalysisPrompt({
      ...baseInput,
      confluence: {
        score: 77,
        direction: "LONG",
        confidence: 60,
        factors: [{ name: "Trend", weight: 2, score: 1.5, direction: "LONG", detail: "EMA20 di atas SMA20" }],
        regime: { trend: "up", volatility: "normal", momentum: "up", regimeLabel: "R" },
        narrative: "N",
      },
      scalping: {
        direction: "LONG",
        confidence: 55,
        score: 60,
        reasoning: ["VWAP naik"],
        entryType: "PULLBACK",
        volatility: "SCALPABLE",
        atrPercent: 0.12,
        gated: false,
        suggestion: "Entry area 2348-2352, SL di bawah 2346",
      },
      newsContext: {
        topHeadlines: [{ title: "Gold naik", sentiment: "BULLISH" }],
        calendar: { nextHighImpact: { date: "2026-09-09T12:30:00Z", event: "CPI", country: "US", currency: "USD", importance: "high", forecast: "3.2%", previous: "3.1%", actual: null, unit: "%" } },
        source: "yahoo-rss-heuristic",
      },
    });
    expect(prompt).toContain("XAUUSD");
    expect(prompt).toContain("5m");
    expect(prompt).toContain("skor 77/100");
    expect(prompt).toContain("CPI");
    expect(prompt).toContain("[BULLISH] Gold naik");
  });

  it("instruksi grounded memuat aturan larangan mengarang angka", () => {
    expect(GROUNDED_INSTRUCTIONS).toContain("DILARANG mengarang");
    expect(GROUNDED_INSTRUCTIONS).toContain("AGREE");
    expect(GROUNDED_INSTRUCTIONS).toContain("OVERRIDE");
  });
});