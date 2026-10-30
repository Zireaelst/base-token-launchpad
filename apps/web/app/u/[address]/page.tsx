import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { basescan } from "@/lib/config";
import { formatEth, formatTokens, shortAddress, timeAgo } from "@/lib/format";
import { type Creator, indexer, type TokenListItem } from "@/lib/indexer";
import { ClaimPanel } from "./ClaimPanel";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? shortAddress(address) : "Profile" };
}

export default async function ProfilePage({ params }: Props) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const data = await indexer<Creator>(`/creators/${address}`, { revalidate: 5 });

  return (
    <div className="grid gap-8 py-6">
      <header>
        <h1 className="font-pixel text-3xl tabular">{shortAddress(address)}</h1>
        <a
          href={basescan.address(address)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-mute"
        >
          {address} ↗
        </a>
      </header>

      {data === null ? (
        <p className="font-mono text-sm text-mute">
          Profile data is offline for a moment. Try again shortly.
        </p>
      ) : (
        <>
          <ClaimPanel owner={address} positions={data.positions} />
          <TokenList title="Tokens created" items={data.created} empty="No tokens created yet." />
          <TokenList
            title="Holdings"
            items={data.holdings}
            empty="No holdings."
            extra={(t) => ("balance" in t ? `${formatTokens(t.balance as string)} $${t.symbol}` : "")}
          />
          <section aria-labelledby="history-title">
            <h2 id="history-title" className="font-mono text-xs uppercase text-mute">
              Claim history
            </h2>
            {data.claims.length === 0 ? (
              <p className="py-3 font-mono text-sm text-mute">No claims yet.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line font-mono text-xs tabular">
                {data.claims.map((c) => (
                  <li key={c.txHash + c.positionId} className="flex justify-between py-2">
                    <span>claimed {formatEth(c.nativeWei)} ETH</span>
                    <a href={basescan.tx(c.txHash)} target="_blank" rel="noreferrer" className="text-mute">
                      {timeAgo(c.timestamp)} ↗
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TokenList({
  title,
  items,
  empty,
  extra,
}: {
  title: string;
  items: TokenListItem[];
  empty: string;
  extra?: (t: TokenListItem) => string;
}) {
  return (
    <section aria-label={title}>
      <h2 className="font-mono text-xs uppercase text-mute">{title}</h2>
      {items.length === 0 ? (
        <p className="py-3 font-mono text-sm text-mute">{empty}</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {items.map((t) => (
            <li key={t.address}>
              <Link
                href={`/t/${t.address}`}
                className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-2 py-2 font-mono text-sm tabular"
              >
                <span>
                  <span className="font-pixel">${t.symbol}</span> <span className="text-mute">{t.name}</span>
                </span>
                <span>{extra ? extra(t) : `${formatEth(t.creatorFeesWei)} ETH earned`}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
