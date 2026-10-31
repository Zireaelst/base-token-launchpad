"use client";

import { TypingDots } from "@launchpad/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { basescan } from "@/lib/config";
import { formatEth, formatTokens, shortAddress, timeAgo } from "@/lib/format";
import { type Holder, indexer, type Trade } from "@/lib/indexer";

const SUPPLY = 1_000_000_000n * 10n ** 18n;

export function TradesFeed({ token, symbol }: { token: string; symbol: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["trades", token],
    queryFn: () => indexer<{ items: Trade[] }>(`/tokens/${token}/trades?limit=30`),
    refetchInterval: 4_000,
  });
  const items = data?.items ?? [];
  return (
    <section aria-labelledby="trades-title">
      <h2 id="trades-title" className="font-mono text-xs uppercase text-mute">
        Trades
      </h2>
      {isLoading ? (
        <p className="py-4 text-mute">
          <TypingDots>loading</TypingDots>
        </p>
      ) : items.length === 0 ? (
        <p className="py-4 font-mono text-sm text-mute">No trades yet.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line font-mono text-xs tabular">
          {items.map((t) => (
            <li
              key={t.id}
              className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 py-2 sm:grid-cols-[3.5rem_1fr_1fr_auto]"
            >
              <span className={t.side === "buy" ? "text-buy" : "text-sell"}>{t.side.toUpperCase()}</span>
              <span>
                {formatEth(t.ethWei)} ETH{" "}
                <span className="text-mute">
                  · {formatTokens(t.tokenAmount)} ${symbol}
                </span>
              </span>
              <Link href={`/u/${t.trader}`} className="hidden sm:block">
                {shortAddress(t.trader)}
              </Link>
              <a href={basescan.tx(t.txHash)} target="_blank" rel="noreferrer" className="text-mute">
                {timeAgo(t.timestamp)} ↗
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TopHolders({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: ["holders", token],
    queryFn: () => indexer<{ items: Holder[] }>(`/tokens/${token}/holders`),
    refetchInterval: 15_000,
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="holders-title">
      <h2 id="holders-title" className="font-mono text-xs uppercase text-mute">
        Top holders
      </h2>
      <ol className="mt-2 grid gap-1 font-mono text-xs tabular">
        {items.map((h, i) => {
          const bps = (BigInt(h.balance) * 10_000n) / SUPPLY;
          return (
            <li key={h.account} className="flex justify-between gap-2">
              <span>
                {i + 1}.{" "}
                {h.isPool ? (
                  <span>pool (Uniswap v4)</span>
                ) : (
                  <Link href={`/u/${h.account}`}>{shortAddress(h.account)}</Link>
                )}
              </span>
              <span>{`${bps / 100n}.${String(bps % 100n).padStart(2, "0")}%`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ShareButton({ symbol }: { symbol: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split("?")[0] as string;
    const text = `$${symbol} on Base: fixed supply, liquidity locked forever.`;
    if (navigator.share) {
      await navigator.share({ title: `$${symbol}`, text, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={share}
      className="min-h-11 border border-ink px-4 font-mono text-sm uppercase"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

export function ReportButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [reason, setReason] = useState("scam");
  if (state === "sent") return <p className="font-mono text-xs text-mute">Thanks. We will review it.</p>;
  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        className="min-h-11 font-mono text-xs text-mute underline"
      >
        Report this token
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 font-mono text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, reason }),
        });
        setState("sent");
      }}
    >
      <label>
        <span className="sr-only">Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-11 border border-line bg-bg px-2"
        >
          <option value="scam">Scam</option>
          <option value="impersonation">Impersonation</option>
          <option value="offensive">Offensive</option>
          <option value="other">Other</option>
        </select>
      </label>
      <button type="submit" className="min-h-11 border border-ink px-3 uppercase">
        Send report
      </button>
    </form>
  );
}
