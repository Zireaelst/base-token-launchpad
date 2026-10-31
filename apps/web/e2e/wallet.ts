import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Address, Hex } from "viem";

const local = JSON.parse(
  readFileSync(new URL("../../../packages/contracts/deployments/local.json", import.meta.url), "utf8"),
) as { rpcUrl: string };

export const RPC = local.rpcUrl;

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

/**
 * A mock injected wallet (EIP-1193) for an impersonated, funded anvil account. Every request goes from the
 * page to Node (exposeFunction) and on to the fork, so the app talks to a real chain. It reports no
 * EIP-5792 support, which exercises the sequential (EOA) path. Sent transactions are recorded so the test
 * can check each one carries the Builder Code.
 */
export async function installWallet(page: Page, account: Address) {
  await rpc("anvil_impersonateAccount", [account]);
  await rpc("anvil_setBalance", [account, "0x56BC75E2D63100000"]); // 100 ETH
  const sent: Hex[] = [];

  await page.exposeFunction("__walletRpc", async (method: string, params: unknown[]) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account];
      case "eth_chainId":
        return "0x2105";
      case "wallet_switchEthereumChain":
      case "wallet_requestPermissions":
        return null;
      case "wallet_getCapabilities":
        throw Object.assign(new Error("Method not supported"), { code: 4200 });
      case "eth_sendTransaction": {
        const [tx] = params as [{ data?: Hex }];
        sent.push(tx.data ?? "0x");
        return rpc("eth_sendTransaction", params);
      }
      default:
        return rpc(method, params);
    }
  });

  await page.addInitScript(() => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const call = (window as unknown as { __walletRpc: (m: string, p: unknown[]) => Promise<unknown> })
      .__walletRpc;
    const provider = {
      isMetaMask: false,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        try {
          return await call(method, params ?? []);
        } catch (e) {
          const err = e as { message?: string; code?: number };
          throw Object.assign(new Error(err.message ?? "wallet error"), { code: err.code ?? -32603 });
        }
      },
      on: (ev: string, fn: (...a: unknown[]) => void) => {
        listeners[ev] ??= [];
        listeners[ev].push(fn);
      },
      removeListener: (ev: string, fn: (...a: unknown[]) => void) => {
        listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn);
      },
    };
    (window as unknown as { ethereum: unknown }).ethereum = provider;
  });

  return { sent };
}
