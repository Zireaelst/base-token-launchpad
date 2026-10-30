"use client";

import { BracketTabs, DitherImage, TypingDots } from "@launchpad/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { formatBpsChange, formatEth, timeAgo } from "@/lib/format";
import { trustedImage } from "@/lib/images";
import { indexer, type TokenListItem } from "@/lib/indexer";

type Tab = "new" | "trending" | "earners";
const TABS = [
  { id: "new", label: "New" },
  { id: "trending", label: "Trending" },
  { id: "earners", label: "Top earners" },
] as const;

/** One list, three tabs, search. No filters panel. Hidden tokens are removed server-side by the proxy caller. */
export function TokenBoard({ hidden }: { hidden: string[] }) {
  const [tab, setTab] = useState<Tab>("new");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const { data, isLoading } = useQuery({
    queryKey: ["tokens", tab, query],
    queryFn: () =>
      indexer<{ items: TokenListItem[] }>(
        `/tokens?tab=${tab}&limit=50${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      ),
    refetchInterval: 5_000,
  });
  const hide = new Set(hidden);
  const items = (data?.items ?? []).filter((t) => !hide.has(t.address.toLowerCase()));

  return (
    <section aria-labelledby="board-title" className="mt-6">
      <h2 id="board-title" className="sr-only">
        Tokens
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BracketTabs tabs={TABS} value={tab} onChange={setTab} label="Sort tokens" />
        <label className="flex min-h-11 w-full items-center gap-2 border border-line px-3 font-mono text-sm sm:w-72">
          <span className="text-mute">/</span>
          <span className="sr-only">Search by name, ticker or address</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name, $ticker or 0x…"
            className="w-full bg-transparent outline-none placeholder:text-mute"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-mute">
          <TypingDots>loading</TypingDots>
        </p>
      ) : data === null ? (
        <p className="py-10 text-center font-mono text-sm text-mute">
          The board is offline for a moment. Try again shortly.
        </p>
      ) : items.length === 0 ? (
        <EmptyBoard searching={Boolean(query)} />
      ) : (
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {items.map((t) => (
            <li key={t.address}>
              <TokenRow token={t} tab={tab} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TokenRow({ token: t, tab }: { token: TokenListItem; tab: Tab }) {
  const change = BigInt(t.change1hBps);
  return (
    <Link
      href={`/t/${t.address}`}
      className="grid min-h-16 grid-cols-[40px_1fr_auto] items-center gap-3 py-2 sm:grid-cols-[40px_1.2fr_1fr_1fr_1fr_1fr]"
    >
      <DitherImage src={trustedImage(t.image) ?? ""} alt="" />
      <span className="min-w-0">
        <span className="block truncate font-pixel text-base">${t.symbol}</span>
        <span className="block truncate text-xs text-mute">{t.name}</span>
      </span>
      <span className="text-right font-mono text-sm tabular sm:text-left">
        <span className="sr-only">Market cap </span>
        {formatEth(t.marketCapWei)} ETH
        <span
          className={`block text-xs sm:hidden ${change > 0n ? "text-buy" : change < 0n ? "text-sell" : "text-mute"}`}
        >
          {formatBpsChange(t.change1hBps)}
        </span>
      </span>
      <span
        className={`hidden font-mono text-sm tabular sm:block ${change > 0n ? "text-buy" : change < 0n ? "text-sell" : "text-mute"}`}
      >
        <span className="sr-only">1h change </span>
        {formatBpsChange(t.change1hBps)}
      </span>
      <span className="hidden font-mono text-sm text-mute sm:block">{timeAgo(t.launchedAt)}</span>
      <span className="hidden font-mono text-sm tabular sm:block">
        <span className="sr-only">Creator earned </span>
        {tab === "trending" && t.volume1hWei
          ? `${formatEth(t.volume1hWei)} ETH 1h vol`
          : `${formatEth(t.creatorFeesWei)} ETH earned`}
      </span>
    </Link>
  );
}

function EmptyBoard({ searching }: { searching: boolean }) {
  return (
    <div className="my-10 border border-dashed border-line p-8 text-center">
      <p className="font-pixel text-xl">{searching ? "NO MATCH" : "NO TOKENS YET"}</p>
      <p className="mt-2 font-mono text-sm text-mute">
        {searching ? "Try another name, ticker or address." : "Be the first to launch one."}
      </p>
      {!searching && (
        <Link
          href="/create"
          className="mt-4 inline-flex min-h-11 items-center bg-ink px-5 font-mono text-sm uppercase text-bg"
        >
          Launch a token
        </Link>
      )}
    </div>
  );
}
