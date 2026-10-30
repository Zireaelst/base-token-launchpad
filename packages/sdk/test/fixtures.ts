import type { Address } from "viem";
import { createAttribution, createContext, UERC20_FACTORY_CANONICAL } from "../src/index.ts";

/** Addresses from the dry run on a Base fork with the placeholder treasury (docs/deployment.md). */
export const ctx = createContext({
  tokenFactory: UERC20_FACTORY_CANONICAL,
  beneficiaryVault: "0x476bDF489FD0cf81E1B58F8f4cd9B0f62d6324A2",
  feeSplitter: "0xEE03DE7A6536BE2bBb3b8C4F7E8872b03D626a9B",
  instantLaunchStrategy: "0x4EF4FAE8CD0eD8DaC86aF7e319F5Ecb3BD427Adc",
  universalRouterStrategy: "0x0A122717bc36E3C7A7958128a5C789E0b070b3Ae",
});

/** Test-only Builder Code; the real one comes from base.dev via env. */
export const attribution = createAttribution("bc_test");

export const creator: Address = "0x00000000000000000000000000000000c0ffee01";
export const deadline = 2_000_000_000n;
export const metadata = { description: "", website: "", image: "", extraData: "0x" } as const;
