import { describe, expect, it } from "vitest";
import { formatBpsChange, formatEth, formatTokens, parseEthInput, timeAgo } from "./format";

describe("money formatting is integer-only", () => {
  it("formats ETH", () => {
    expect(formatEth(10n ** 18n)).toBe("1");
    expect(formatEth(2_808_162_349_000_000_000n)).toBe("2.808");
    expect(formatEth(374_849_999_999_999n)).toBe("0.00037");
    expect(formatEth(1234n * 10n ** 18n)).toBe("1,234");
    // Dust keeps significant digits instead of rounding to zero.
    expect(formatEth(2_808_162_349n)).toBe("0.0000000028");
    expect(formatEth(0n)).toBe("0");
  });

  it("formats token amounts compactly", () => {
    expect(formatTokens(38_245_095n * 10n ** 18n)).toBe("38.2M");
    expect(formatTokens(1_000_000_000n * 10n ** 18n)).toBe("1B");
    expect(formatTokens(1_500n * 10n ** 18n)).toBe("1.5K");
    expect(formatTokens(12n * 10n ** 17n)).toBe("1.2");
  });

  it("formats bps changes", () => {
    expect(formatBpsChange("1199")).toBe("+11.99%");
    expect(formatBpsChange("-50")).toBe("-0.5%");
    expect(formatBpsChange("0")).toBe("0%");
  });

  it("parses typed ETH without floats", () => {
    expect(parseEthInput("0.05")).toBe(5n * 10n ** 16n);
    expect(parseEthInput("1")).toBe(10n ** 18n);
    expect(parseEthInput(".1")).toBe(10n ** 17n);
    expect(parseEthInput("0.000000000000000001")).toBe(1n);
    for (const bad of ["", ".", "abc", "1e3", "-1", "0.0000000000000000001"])
      expect(parseEthInput(bad)).toBeNull();
  });

  it("time ago", () => {
    expect(timeAgo(100, 112)).toBe("12s ago");
    expect(timeAgo(0, 3 * 3600)).toBe("3h ago");
  });
});

import { effectiveFeePips, pipsToPercent } from "./fees";

describe("fee display", () => {
  it("matches the fork measurement: 0.25% LP + 0.04% protocol = 2899 pips", () => {
    expect(effectiveFeePips(2_500, 400)).toBe(2_899);
    expect(pipsToPercent(2_899)).toBe("0.2899%");
    expect(pipsToPercent(2_500)).toBe("0.25%");
    expect(pipsToPercent(400)).toBe("0.04%");
  });
});
