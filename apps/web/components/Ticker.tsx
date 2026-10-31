"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatEth, timeAgo } from "@/lib/format";
import { indexer, type TickerEvent } from "@/lib/indexer";

/** Live strip of real events from the indexer. Hidden when there are none. */
export function Ticker() {
  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: () => indexer<{ items: TickerEvent[]; launchedLastMinute: number }>("/events?limit=10"),
    refetchInterval: 5_000,
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-label="Live activity" className="-mx-4 overflow-x-auto border-y border-line px-4 py-2">
      <ul className="flex gap-6 whitespace-nowrap font-mono text-xs">
        {items.map((e) => (
          <li key={`${e.kind}-${e.token}-${e.timestamp}-${e.ethWei ?? ""}`}>
            <Link href={`/t/${e.token}`} className="inline-flex min-h-11 items-center gap-1">
              <span className="font-pixel-grid">${e.symbol}</span>
              {e.kind === "launch" ? (
                <span>launched</span>
              ) : (
                <span className={e.kind === "buy" ? "text-buy" : "text-sell"}>
                  {e.kind} {formatEth(e.ethWei ?? "0")} ETH
                </span>
              )}
              <span className="text-mute">{timeAgo(e.timestamp)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
