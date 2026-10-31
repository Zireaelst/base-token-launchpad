import { createAttribution, createContext, type LaunchpadDeployment } from "@launchpad/sdk";
import type { Address } from "viem";

/**
 * Public, client-safe configuration. Contract addresses are public data; RPC and indexer URLs are not
 * and stay server-side (see lib/server.ts and the /api proxies).
 */
const pub = {
  builderCode: process.env.NEXT_PUBLIC_BUILDER_CODE,
  tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY,
  beneficiaryVault: process.env.NEXT_PUBLIC_BENEFICIARY_VAULT,
  feeSplitter: process.env.NEXT_PUBLIC_FEE_SPLITTER,
  instantLaunchStrategy: process.env.NEXT_PUBLIC_INSTANT_LAUNCH_STRATEGY,
  universalRouterStrategy: process.env.NEXT_PUBLIC_UNIVERSAL_ROUTER_STRATEGY,
  treasury: process.env.NEXT_PUBLIC_PLATFORM_TREASURY,
  sponsorFirstLaunch: process.env.NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH === "true",
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const deployment: LaunchpadDeployment = {
  tokenFactory: required("NEXT_PUBLIC_TOKEN_FACTORY", pub.tokenFactory) as Address,
  beneficiaryVault: required("NEXT_PUBLIC_BENEFICIARY_VAULT", pub.beneficiaryVault) as Address,
  feeSplitter: required("NEXT_PUBLIC_FEE_SPLITTER", pub.feeSplitter) as Address,
  instantLaunchStrategy: required(
    "NEXT_PUBLIC_INSTANT_LAUNCH_STRATEGY",
    pub.instantLaunchStrategy,
  ) as Address,
  universalRouterStrategy: required(
    "NEXT_PUBLIC_UNIVERSAL_ROUTER_STRATEGY",
    pub.universalRouterStrategy,
  ) as Address,
};

export const ctx = createContext(deployment);
export const treasury = required("NEXT_PUBLIC_PLATFORM_TREASURY", pub.treasury) as Address;

/** Every transaction the app sends carries this Builder Code (docs/decisions.md §17). */
export const attribution = createAttribution(required("NEXT_PUBLIC_BUILDER_CODE", pub.builderCode));

export const flags = { sponsorFirstLaunch: pub.sponsorFirstLaunch };

export const AUDIT_URL =
  "https://github.com/Uniswap/liquidity-launcher/blob/main/docs/audit/OpenZeppelin_v3.0.0.pdf";
export const basescan = {
  address: (a: string) => `https://basescan.org/address/${a}`,
  token: (a: string) => `https://basescan.org/token/${a}`,
  tx: (h: string) => `https://basescan.org/tx/${h}`,
  // On a local fork the explorer links still point at mainnet; they resolve once deployed.
};
