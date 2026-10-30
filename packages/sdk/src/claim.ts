import type { Client } from "viem";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { readContract, simulateCalls } from "viem/actions";
import { beneficiaryVaultAbi, feeSplitterAbi } from "./abis.generated.ts";
import type { LaunchpadContext } from "./addresses.ts";
import {
  type AttributedBatch,
  type AttributedTx,
  type Attribution,
  attribute,
  attributeBatch,
  type Call,
} from "./attribution.ts";

/**
 * Creator fees reach the creator in two steps (docs/decisions.md §8):
 *   1. FeeSplitter.collectFees(tokenIds): permissionless, pulls fees from the pools into the vault.
 *   2. BeneficiaryVault.claim(tokenId, min0, min1): beneficiary NFT owner only, once per position.
 * `tokenId` is the launch's v4 position id, which is also the id of the creator's beneficiary NFT.
 */
function collectCall(ctx: LaunchpadContext, tokenIds: readonly bigint[]): Call {
  if (tokenIds.length === 0) throw new Error("no positions to collect");
  return {
    to: ctx.deployment.feeSplitter,
    data: encodeFunctionData({ abi: feeSplitterAbi, functionName: "collectFees", args: [tokenIds] }),
    value: 0n,
  };
}

function claimCall(ctx: LaunchpadContext, tokenId: bigint): Call {
  return {
    to: ctx.deployment.beneficiaryVault,
    // Mins are 0: the claim pays out amounts already attributed to the position, so there is no price risk.
    data: encodeFunctionData({ abi: beneficiaryVaultAbi, functionName: "claim", args: [tokenId, 0n, 0n] }),
    value: 0n,
  };
}

/** "Claim all" as a single EIP-5792 batch (Base App / Coinbase Smart Wallet): one signature. */
export function prepareClaimAllBatch(
  ctx: LaunchpadContext,
  tokenIds: readonly bigint[],
  attribution: Attribution,
): AttributedBatch {
  return attributeBatch(
    [collectCall(ctx, tokenIds), ...tokenIds.map((id) => claimCall(ctx, id))],
    attribution,
  );
}

/** "Claim all" for wallets without EIP-5792: collect once, then one claim per position. */
export function prepareClaimAllSequential(
  ctx: LaunchpadContext,
  tokenIds: readonly bigint[],
  attribution: Attribution,
): AttributedTx[] {
  return [collectCall(ctx, tokenIds), ...tokenIds.map((id) => claimCall(ctx, id))].map((c) =>
    attribute(c, attribution),
  );
}

export type Claimable = { positionId: bigint; nativeWei: bigint; tokenAmount: bigint };

/**
 * Exact claimable fees per position: simulates the permissionless `collectFees` and then reads the
 * vault's attributed `amounts` in one eth_simulateV1 call, so fees still sitting in the pool are included.
 * Falls back to the already-collected `amounts` if the RPC does not support eth_simulateV1
 * (`includesUncollected` tells the UI which number it is showing).
 */
export async function readClaimable(
  client: Client,
  ctx: LaunchpadContext,
  positionIds: readonly bigint[],
): Promise<{ items: Claimable[]; includesUncollected: boolean }> {
  if (positionIds.length === 0) return { items: [], includesUncollected: true };
  const reads = positionIds.map((id) => ({
    to: ctx.deployment.beneficiaryVault,
    data: encodeFunctionData({ abi: beneficiaryVaultAbi, functionName: "amounts", args: [id] }),
  }));
  try {
    const { results } = await simulateCalls(client, { calls: [collectCall(ctx, positionIds), ...reads] });
    if (results[0]?.status !== "success") throw new Error("collect simulation failed");
    const items = positionIds.map((positionId, i) => {
      const r = results[i + 1];
      if (!r || r.status !== "success") throw new Error("amounts read failed");
      const [nativeWei, tokenAmount] = decodeFunctionResult({ abi: beneficiaryVaultAbi, functionName: "amounts", data: r.data });
      return { positionId, nativeWei, tokenAmount };
    });
    return { items, includesUncollected: true };
  } catch {
    const items = await Promise.all(
      positionIds.map(async (positionId) => {
        const [nativeWei, tokenAmount] = await readContract(client, {
          address: ctx.deployment.beneficiaryVault,
          abi: beneficiaryVaultAbi,
          functionName: "amounts",
          args: [positionId],
        });
        return { positionId, nativeWei, tokenAmount };
      }),
    );
    return { items, includesUncollected: false };
  }
}
