import { RulesCard, type RulesCardRow } from "@launchpad/ui";
import type { Address } from "viem";
import { AUDIT_URL, basescan, ctx } from "@/lib/config";
import { effectiveFeePips, pipsToPercent } from "@/lib/fees";
import { shortAddress, timeAgo } from "@/lib/format";

export type Fees = { lpFee: number; protocolBuy: number; protocolSell: number } | null;

/**
 * The rules card: plain-words facts with a BaseScan link for each claim.
 * `token` is absent on the create preview (nothing is deployed yet).
 */
export function TokenRules({
  token,
  creator,
  launchedAt,
  fees,
}: {
  token?: Address;
  creator?: Address;
  launchedAt?: number;
  fees: Fees;
}) {
  const lp = fees?.lpFee ?? 2_500;
  const protocol = fees ? Math.max(fees.protocolBuy, fees.protocolSell) : undefined;
  const tradeFee =
    protocol === undefined
      ? `${pipsToPercent(lp)} LP fee  →  creator 60% · platform 40%  (+ Uniswap protocol fee, set at launch)`
      : `${pipsToPercent(effectiveFeePips(lp, protocol))}  =  ${pipsToPercent(lp)} LP fee (creator 60% · platform 40%)${
          protocol > 0 ? ` + ${pipsToPercent(protocol)} Uniswap` : ""
        }`;

  const rows: RulesCardRow[] = [
    {
      label: "SUPPLY",
      value: "1,000,000,000 (fixed, no mint)",
      href: token ? basescan.token(token) : undefined,
    },
    {
      label: "LIQUIDITY",
      value: "locked forever (Uniswap v4)",
      href: basescan.address(ctx.deployment.feeSplitter),
    },
    { label: "TRADE FEE", value: tradeFee, href: basescan.address(ctx.deployment.feeSplitter) },
    { label: "CONTRACTS", value: "audited (Uniswap Liquidity Launcher)", href: AUDIT_URL },
    {
      label: "CREATOR",
      value: creator
        ? `${shortAddress(creator)}${launchedAt ? `  ·  launched ${timeAgo(launchedAt)}` : ""}`
        : "you",
      href: creator ? basescan.address(creator) : undefined,
    },
  ];
  return <RulesCard rows={rows} />;
}
