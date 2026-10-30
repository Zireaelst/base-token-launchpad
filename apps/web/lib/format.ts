/**
 * Display formatting for on-chain amounts. Integer/string math only: no float conversion of money.
 */

/** `amount` (base units) with `decimals` → decimal string with at most `maxFraction` digits, trimmed. */
export function formatUnitsTrim(amount: bigint, decimals: number, maxFraction: number): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  // Tiny non-zero values keep their first significant digits instead of showing "0".
  if (whole === 0n && frac === "" && abs > 0n) {
    const full = (abs % base).toString().padStart(decimals, "0");
    const firstSig = full.search(/[1-9]/);
    frac = full.slice(0, firstSig + 2).replace(/0+$/, "");
  }
  const s = `${groupThousands(whole.toString())}${frac ? `.${frac}` : ""}`;
  return neg ? `-${s}` : s;
}

export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** ETH amount from wei: 4 decimals above 1 ETH, more precision below. */
export function formatEth(wei: bigint | string): string {
  const v = BigInt(wei);
  const abs = v < 0n ? -v : v;
  return formatUnitsTrim(v, 18, abs >= 10n ** 18n ? 3 : 5);
}

/** Token amount (18 decimals), compact: 38.2M, 1.5K. */
export function formatTokens(amount: bigint | string): string {
  const whole = BigInt(amount) / 10n ** 18n;
  const units: [bigint, string][] = [
    [1_000_000_000n, "B"],
    [1_000_000n, "M"],
    [1_000n, "K"],
  ];
  for (const [size, suffix] of units) {
    if (whole >= size) return `${formatUnitsTrim((whole * 10n) / size, 1, 1)}${suffix}`;
  }
  return formatUnitsTrim(BigInt(amount), 18, 2);
}

/** Basis points → signed percent string, e.g. 1199 → "+11.99%". */
export function formatBpsChange(bps: bigint | string): string {
  const v = BigInt(bps);
  const sign = v > 0n ? "+" : v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  return `${sign}${formatUnitsTrim(abs, 2, 2) || "0"}%`;
}

/** Parse a user-typed ETH amount ("0.05") to wei without floats. Returns null if invalid. */
export function parseEthInput(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > 18) return null;
  return BigInt(whole || "0") * 10n ** 18n + BigInt(frac.padEnd(18, "0") || "0");
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function timeAgo(unixSeconds: number, now = Math.floor(Date.now() / 1000)): string {
  const d = Math.max(0, now - unixSeconds);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
