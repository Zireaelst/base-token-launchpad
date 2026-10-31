import Link from "next/link";
import { HeroVisual } from "@/components/HeroVisual";
import { Ticker } from "@/components/Ticker";
import { TokenBoard } from "@/components/TokenBoard";
import { formatEth, groupThousands } from "@/lib/format";
import { indexer, type Stats } from "@/lib/indexer";
import { hiddenTokens } from "@/lib/moderation";

export const revalidate = 10;

export default async function BoardPage() {
  const stats = await indexer<Stats>("/stats", { revalidate: 10 });
  return (
    <>
      <section className="grid items-center gap-6 py-6 sm:grid-cols-2 sm:py-12">
        <div>
          <h1 className="font-pixel text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            LAUNCH
            <br />
            ON BASE
          </h1>
          <p className="mt-4 max-w-md font-mono text-sm">
            Fixed supply. Locked liquidity. Creators earn 60% of fees, in ETH.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center bg-ink px-5 font-mono text-sm uppercase text-bg"
            >
              Launch a token
            </Link>
            <Link href="#board-title" className="inline-flex min-h-11 items-center font-mono text-sm">
              Explore tokens ›
            </Link>
          </div>
          {/* Real numbers only: hidden when the indexer is unreachable. */}
          {stats && (
            <p className="mt-6 font-mono text-xs text-mute tabular">
              {groupThousands(String(stats.launches))} launched · {groupThousands(String(stats.uniqueUsers))}{" "}
              users · {formatEth(stats.volumeWei)} ETH volume · {formatEth(stats.ethPaidToCreatorsWei)} ETH
              paid to creators
            </p>
          )}
        </div>
        <HeroVisual />
      </section>
      <Ticker />
      <TokenBoard hidden={[...hiddenTokens()]} />
    </>
  );
}
