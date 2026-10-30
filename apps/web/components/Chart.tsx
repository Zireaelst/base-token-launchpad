"use client";

import { BracketTabs, TypingDots } from "@launchpad/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatEth } from "@/lib/format";
import { type Candle, indexer } from "@/lib/indexer";

const INTERVALS = [
  { id: "60", label: "1m" },
  { id: "300", label: "5m" },
  { id: "3600", label: "1h" },
  { id: "86400", label: "1d" },
] as const;
const SUPPLY = 1_000_000_000n;
const W = 600;
const H = 220;

/** Market cap candles (ETH), built only from real swaps. Monochrome; colour only for up/down. */
export function Chart({ token }: { token: string }) {
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]["id"]>("300");
  const { data, isLoading } = useQuery({
    queryKey: ["candles", token, interval],
    queryFn: () => indexer<{ items: Candle[] }>(`/tokens/${token}/candles?interval=${interval}&limit=120`),
    refetchInterval: 5_000,
  });
  const candles = data?.items ?? [];

  return (
    <section aria-label="Market cap chart" className="border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-mute">MARKET CAP · ETH</span>
        <BracketTabs tabs={INTERVALS} value={interval} onChange={setInterval} label="Candle interval" />
      </div>
      {isLoading ? (
        <p className="grid h-[220px] place-items-center text-mute">
          <TypingDots>loading</TypingDots>
        </p>
      ) : candles.length === 0 ? (
        <p className="grid h-[220px] place-items-center font-mono text-sm text-mute">
          No trades yet. The first trade draws the first candle.
        </p>
      ) : (
        <Candles candles={candles} />
      )}
    </section>
  );
}

function Candles({ candles }: { candles: Candle[] }) {
  // Scale in bigint, then map to pixels: market cap in wei = price per token × supply.
  const mc = (v: string) => BigInt(v) * SUPPLY;
  const highs = candles.map((c) => mc(c.high));
  const lows = candles.map((c) => mc(c.low));
  const max = highs.reduce((a, b) => (b > a ? b : a));
  const min = lows.reduce((a, b) => (b < a ? b : a));
  const span = max - min || max / 10n || 1n;
  const pad = span / 10n;
  const top = max + pad;
  const range = span + pad * 2n;
  const y = (v: bigint) => Number(((top - v) * BigInt(H * 1000)) / range) / 1000;
  const step = W / Math.max(candles.length, 30);
  const body = Math.max(step * 0.6, 2);
  const last = candles.at(-1);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-[220px] w-full"
        role="img"
        aria-label="Candlestick chart"
      >
        {candles.map((c, i) => {
          const o = mc(c.open);
          const cl = mc(c.close);
          const up = cl >= o;
          const x = W - (candles.length - i) * step + step / 2;
          const color = up ? "var(--buy)" : "var(--sell)";
          return (
            <g key={c.bucket}>
              <line x1={x} x2={x} y1={y(mc(c.high))} y2={y(mc(c.low))} stroke={color} strokeWidth={1} />
              <rect
                x={x - body / 2}
                y={Math.min(y(o), y(cl))}
                width={body}
                height={Math.max(Math.abs(y(o) - y(cl)), 1)}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
      {last && (
        <figcaption className="font-mono text-xs tabular">
          last {formatEth(mc(last.close))} ETH · high {formatEth(max)} · low {formatEth(min)}
        </figcaption>
      )}
    </figure>
  );
}
