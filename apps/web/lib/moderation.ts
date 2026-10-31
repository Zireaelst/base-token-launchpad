/**
 * Trust & safety, pluggable and deliberately simple for the MVP:
 * - a word blocklist for names, tickers and descriptions (checked before upload and launch);
 * - HIDDEN_TOKENS (server env, comma separated): hidden from the board, still reachable by URL with a
 *   warning banner. Reports are stored for review (see app/api/report) and acted on by editing this list.
 */
const BLOCKLIST = (process.env.MODERATION_BLOCKLIST ?? "")
  .split(",")
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

export function blockedTerm(...texts: string[]): string | undefined {
  const hay = texts.join(" ").toLowerCase();
  return BLOCKLIST.find((w) => hay.includes(w));
}

export function hiddenTokens(): Set<string> {
  return new Set(
    (process.env.HIDDEN_TOKENS ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isHidden = (address: string) => hiddenTokens().has(address.toLowerCase());
