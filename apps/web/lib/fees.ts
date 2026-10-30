// Fee math shared by server and client components. Integer arithmetic only.

/** Effective swap fee in pips: v4 applies the protocol fee first, then the LP fee on the remainder. */
export const effectiveFeePips = (lpFee: number, protocolFee: number) =>
  protocolFee + lpFee - Math.floor((protocolFee * lpFee) / 1_000_000);

/** "0.2899%" from pips, integer math. */
export function pipsToPercent(pips: number): string {
  const whole = Math.floor(pips / 10_000);
  const frac = String(pips % 10_000)
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}
