import type { Metadata } from "next";
import { formatEth, groupThousands } from "@/lib/format";
import { indexer, type Stats } from "@/lib/indexer";

export const metadata: Metadata = { title: "Stats" };
export const revalidate = 30;

/** Public metrics, same definitions as the grant dashboard (docs/grant-metrics.md). Team wallets excluded. */
export default async function StatsPage() {
  const s = await indexer<Stats>("/stats", { revalidate: 30 });
  const rows: [string, string][] = s
    ? [
        ["Unique users (all time)", groupThousands(String(s.uniqueUsers))],
        ["Daily active users", groupThousands(String(s.dau))],
        ["Weekly active users", groupThousands(String(s.wau))],
        ["Volume (all time)", `${formatEth(s.volumeWei)} ETH`],
        ["Volume (30 days)", `${formatEth(s.volume30dWei)} ETH`],
        ["Tokens launched", groupThousands(String(s.launches))],
        ["Creators who claimed", groupThousands(String(s.creatorsClaimed))],
        ["ETH paid to creators", `${formatEth(s.ethPaidToCreatorsWei)} ETH`],
      ]
    : [];
  return (
    <div className="py-6">
      <h1 className="font-pixel text-4xl">STATS</h1>
      {s === null ? (
        <p className="mt-6 font-mono text-sm text-mute">Stats are offline for a moment. Try again shortly.</p>
      ) : (
        <dl className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-bg p-4">
              <dt className="font-mono text-xs uppercase text-mute">{k}</dt>
              <dd className="mt-1 font-pixel text-2xl tabular">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 font-mono text-xs text-mute">
        From on-chain data via our indexer. Team and test wallets are excluded.
      </p>
    </div>
  );
}
