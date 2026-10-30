import { base } from "viem/chains";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";

/**
 * Wallets: injected (Base App in-app browser, Coinbase Wallet, MetaMask, Rabby) and Base Account
 * (Coinbase Smart Wallet). Reads go through our /api/rpc proxy so RPC keys stay server-side.
 *
 * No client-level `dataSuffix` here: the SDK already attaches the Builder Code to every transaction,
 * and setting it twice would append the suffix twice (docs/decisions.md §17).
 */
export function makeWagmiConfig() {
  return createConfig({
    chains: [base],
    connectors: [injected({ shimDisconnect: true }), baseAccount({ appName: "Launchpad" })],
    transports: { [base.id]: http("/api/rpc") },
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof makeWagmiConfig>;
  }
}
