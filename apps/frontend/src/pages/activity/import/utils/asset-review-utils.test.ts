import type { SymbolSearchResult } from "@/lib/types";
import {
  buildNewAssetFromSearchResult,
  inferInstrumentTypeFromSearchResult,
  mapQuoteTypeToInstrumentType,
} from "./asset-review-utils";

function searchResult(overrides: Partial<SymbolSearchResult>): SymbolSearchResult {
  return {
    exchange: "GER",
    exchangeMic: "XETR",
    exchangeName: "XETRA",
    currency: "EUR",
    shortName: "",
    quoteType: "EQUITY",
    symbol: "TEST",
    index: "",
    score: 1,
    typeDisplay: "",
    longName: "",
    ...overrides,
  };
}

describe("mapQuoteTypeToInstrumentType", () => {
  it("maps provider quote types to import instrument types", () => {
    expect(mapQuoteTypeToInstrumentType("ETF")).toBe("EQUITY");
    expect(mapQuoteTypeToInstrumentType("CRYPTOCURRENCY")).toBe("CRYPTO");
    expect(mapQuoteTypeToInstrumentType("COMMODITY")).toBe("METAL");
    expect(mapQuoteTypeToInstrumentType("FOREX")).toBe("FX");
  });
});

describe("inferInstrumentTypeFromSearchResult", () => {
  it("keeps normal equity-like search results as equity", () => {
    expect(
      inferInstrumentTypeFromSearchResult(
        searchResult({
          symbol: "AAPL",
          shortName: "Apple Inc.",
          longName: "Apple Inc.",
        }),
      ),
    ).toBe("EQUITY");
  });

  it("classifies physical gold and silver ETCs as metal even when providers return equity", () => {
    for (const result of [
      searchResult({
        symbol: "4GLD",
        longName: "DT.BOERSE COM. XETRA-GOLD",
      }),
      searchResult({
        symbol: "WSLV",
        longName: "WisdomTree Physical Silver",
      }),
      searchResult({
        symbol: "SGLN",
        longName: "iShares Physical Gold ETC",
      }),
      searchResult({
        symbol: "PHYS",
        longName: "Sprott Physical Gold Trust",
      }),
    ]) {
      expect(inferInstrumentTypeFromSearchResult(result)).toBe("METAL");
      expect(buildNewAssetFromSearchResult(result, "USD").instrumentType).toBe("METAL");
    }
  });
});
