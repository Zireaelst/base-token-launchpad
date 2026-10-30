"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatEth, timeAgo } from "@/lib/format";
import { indexer, type TickerEvent } from "@/lib/indexer";

// Client-only and loaded after first paint: the headline is the LCP element, never the canvas.
const HeroCanvas = dynamic(() => import("./HeroCanvas").then((m) => m.HeroCanvas), { ssr: false });

/** Speech bubble text from real indexer events only; null hides the bubble. */
function bubbleText(
  data: { items: TickerEvent[]; launchedLastMinute: number } | null | undefined,
): string | null {
  if (!data) return null;
  if (data.launchedLastMinute > 0) {
    return `${data.launchedLastMinute} token${data.launchedLastMinute === 1 ? "" : "s"} launched in the last minute`;
  }
  const e = data.items[0];
  if (!e) return null;
  return e.kind === "launch"
    ? `$${e.symbol} launched ${timeAgo(e.timestamp)}`
    : `${e.kind} $${e.symbol} · ${formatEth(e.ethWei ?? "0")} ETH · ${timeAgo(e.timestamp)}`;
}

export function HeroVisual() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Start the canvas when the browser is idle after the headline has painted.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const id = idle(() => setReady(true));
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, []);

  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: () => indexer<{ items: TickerEvent[]; launchedLastMinute: number }>("/events?limit=10"),
    refetchInterval: 5_000,
  });
  const bubble = bubbleText(data);

  return (
    <div className="relative h-56 w-full sm:h-80">
      {ready && <HeroCanvas />}
      {bubble && (
        <p
          aria-live="polite"
          className="absolute top-2 right-0 max-w-[60%] border-2 border-ink bg-bg px-2 py-1 font-pixel-grid text-xs leading-tight sm:right-4 sm:text-sm"
        >
          {bubble}
          <span
            aria-hidden
            className="absolute -bottom-2 left-4 h-2 w-2 border-r-2 border-b-2 border-ink bg-bg"
          />
        </p>
      )}
    </div>
  );
}
