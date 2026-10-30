"use client";

import type { AttributedBatch, AttributedTx } from "@launchpad/sdk";
import type { TxStep } from "@launchpad/ui";
import { useCallback, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";
import { base } from "viem/chains";
import { useConfig } from "wagmi";
import {
  estimateGas,
  getAccount,
  getCapabilities,
  sendCalls,
  sendTransaction,
  switchChain,
  waitForCallsStatus,
  waitForTransactionReceipt,
} from "wagmi/actions";
import { attribution } from "./config";

export type TxState = { step: TxStep | "idle"; error?: string; hash?: Hex };

export const MESSAGES = {
  notConnected: "Connect a wallet first.",
  rejected: "You rejected the request in your wallet. Nothing was sent.",
  wrongNetwork: "Switch your wallet to Base to continue.",
  insufficient: "Not enough ETH for this amount plus gas.",
  reverted: "The transaction reverted on-chain. Only gas was spent.",
  wouldFail: "This transaction would fail, so it was not sent.",
} as const;

export function classifyError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return MESSAGES.rejected;
    if (err.walk((e) => e instanceof InsufficientFundsError)) return MESSAGES.insufficient;
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError)
      return `${MESSAGES.wouldFail} (${revert.reason ?? revert.shortMessage})`;
    if (/chain|network/i.test(err.shortMessage) && /mismatch|switch|unsupported/i.test(err.shortMessage)) {
      return MESSAGES.wrongNetwork;
    }
    if (/insufficient funds/i.test(err.details ?? "")) return MESSAGES.insufficient;
    if (/execution reverted/i.test(err.details ?? err.shortMessage)) return MESSAGES.wouldFail;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

type RunOptions = {
  /** Resolves true once the indexer has seen the transaction (polls until timeout). */
  isIndexed?: (hash: Hex) => Promise<boolean>;
  /** Gas sponsorship (CDP Paymaster) for smart wallets, behind NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH. */
  sponsor?: boolean;
};

/**
 * One state machine for every transaction in the app: quote → confirm in wallet → submitted → confirmed →
 * indexed. Only accepts SDK-attributed transactions, so the Builder Code cannot be forgotten.
 */
export function useTx() {
  const config = useConfig();
  const [state, setState] = useState<TxState>({ step: "idle" });

  const reset = useCallback(() => setState({ step: "idle" }), []);

  const run = useCallback(
    async (
      input: AttributedTx | AttributedTx[] | AttributedBatch,
      opts: RunOptions = {},
    ): Promise<Hex | undefined> => {
      try {
        const account = getAccount(config);
        if (!account.address) return void setState({ step: "quote", error: MESSAGES.notConnected });
        if (account.chainId !== base.id) {
          try {
            await switchChain(config, { chainId: base.id });
          } catch {
            return void setState({ step: "quote", error: MESSAGES.wrongNetwork });
          }
        }
        const from = account.address;
        const txs = "calls" in input ? [...input.calls] : Array.isArray(input) ? input : [input];

        // Batch through EIP-5792 when the wallet can do it atomically (Base App, Smart Wallet).
        const canBatch = txs.length > 1 || opts.sponsor ? await supportsAtomicBatch(config, from) : false;
        let hash: Hex;
        if (canBatch) {
          setState({ step: "confirm" });
          // Smart wallets put the suffix on the outer userOp callData (build-on-base smart-wallets.md).
          const capabilities: Record<string, unknown> = {
            dataSuffix: { value: attribution.suffix, optional: true },
          };
          if (opts.sponsor)
            capabilities.paymasterService = { url: `${window.location.origin}/api/paymaster` };
          const { id } = await sendCalls(config, {
            account: from,
            chainId: base.id,
            calls: txs.map((t) => ({ to: t.to, data: t.data, value: t.value })),
            capabilities,
          });
          setState({ step: "submitted" });
          const status = await waitForCallsStatus(config, { id, timeout: 120_000 });
          const receipt = status.receipts?.at(-1);
          if (status.status !== "success" || !receipt)
            return void setState({ step: "submitted", error: MESSAGES.reverted });
          hash = receipt.transactionHash;
        } else {
          // Sequential: simulate each first so a failing tx is caught before any gas is spent.
          let last: Hex | undefined;
          for (const tx of txs) {
            setState({ step: "quote" });
            await estimateGas(config, {
              account: from,
              to: tx.to,
              data: tx.data,
              value: tx.value,
              chainId: base.id,
            });
            setState({ step: "confirm" });
            last = await sendTransaction(config, {
              account: from,
              to: tx.to,
              data: tx.data,
              value: tx.value,
              chainId: base.id,
            });
            setState({ step: "submitted", hash: last });
            const receipt = await waitForTransactionReceipt(config, { hash: last, chainId: base.id });
            if (receipt.status !== "success")
              return void setState({ step: "submitted", hash: last, error: MESSAGES.reverted });
          }
          hash = last as Hex;
        }

        setState({ step: "confirmed", hash });
        if (opts.isIndexed) {
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            if (await opts.isIndexed(hash)) break;
            await new Promise((r) => setTimeout(r, 1_000));
          }
        }
        setState({ step: "indexed", hash });
        return hash;
      } catch (err) {
        setState((s) => ({ ...s, step: s.step === "idle" ? "quote" : s.step, error: classifyError(err) }));
        return undefined;
      }
    },
    [config],
  );

  return { state, run, reset };
}

async function supportsAtomicBatch(
  config: Parameters<typeof getCapabilities>[0],
  account: Hex,
): Promise<boolean> {
  try {
    const caps = (await getCapabilities(config, { account, chainId: base.id })) as {
      atomic?: { status?: string };
    };
    return caps.atomic?.status === "supported" || caps.atomic?.status === "ready";
  } catch {
    return false;
  }
}
