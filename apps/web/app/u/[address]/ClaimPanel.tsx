"use client";

import { prepareClaimAllBatch, readClaimable } from "@launchpad/sdk";
import { Button, TxSteps, TypingDots } from "@launchpad/ui";
import { useQuery } from "@tanstack/react-query";
import { track } from "@vercel/analytics";
import type { Address } from "viem";
import { isAddressEqual } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { attribution, ctx } from "@/lib/config";
import { formatEth, formatTokens } from "@/lib/format";
import { type Creator, indexer } from "@/lib/indexer";
import { useTx } from "@/lib/useTx";

/**
 * Claimable creator fees across every position whose beneficiary NFT this address owns, and one
 * "Claim all" button: one signature on smart wallets (EIP-5792 batch), collect + one claim per token otherwise.
 */
export function ClaimPanel({ owner, positions }: { owner: Address; positions: string[] }) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { state, run } = useTx();
  const ids = positions.map(BigInt);
  const isOwner = Boolean(address && isAddressEqual(address, owner));

  const claimable = useQuery({
    queryKey: ["claimable", owner, positions.join(",")],
    enabled: Boolean(client) && ids.length > 0,
    queryFn: () => readClaimable(client as never, ctx, ids),
    refetchInterval: 15_000,
  });
  const totalWei = claimable.data?.items.reduce((s, c) => s + c.nativeWei, 0n) ?? 0n;
  const totalTokens = claimable.data?.items.reduce((s, c) => s + c.tokenAmount, 0n) ?? 0n;
  const withFees =
    claimable.data?.items.filter((c) => c.nativeWei > 0n || c.tokenAmount > 0n).map((c) => c.positionId) ??
    [];

  async function claimAll() {
    const hash = await run(prepareClaimAllBatch(ctx, withFees, attribution), {
      // "indexed" only once the indexer has recorded this claim.
      isIndexed: async (h) =>
        Boolean((await indexer<Creator>(`/creators/${owner}`))?.claims.some((c) => c.txHash === h)),
    });
    if (hash) {
      track("fees_claimed");
      await claimable.refetch();
    }
  }

  if (ids.length === 0) return null;
  return (
    <section aria-labelledby="claim-title" className="grid gap-3 border border-ink p-4">
      <h2 id="claim-title" className="font-mono text-xs uppercase">
        Claimable creator fees
      </h2>
      {claimable.isLoading ? (
        <TypingDots>reading</TypingDots>
      ) : (
        <p className="font-pixel text-3xl tabular">
          {formatEth(totalWei)} ETH
          {totalTokens > 0n && (
            <span className="ml-2 font-mono text-sm text-mute">+ {formatTokens(totalTokens)} tokens</span>
          )}
        </p>
      )}
      {claimable.data && !claimable.data.includesUncollected && (
        <p className="font-mono text-xs text-mute">
          Shows fees already collected; fees still in the pools are added when you claim.
        </p>
      )}
      {isOwner ? (
        <Button
          onClick={claimAll}
          disabled={
            withFees.length === 0 || (state.step !== "idle" && !state.error && state.step !== "indexed")
          }
        >
          Claim all
        </Button>
      ) : (
        <p className="font-mono text-xs text-mute">Only the owner of these fee NFTs can claim.</p>
      )}
      {state.step !== "idle" && <TxSteps step={state.step} error={state.error} />}
    </section>
  );
}
