"use client";

import {
  applySlippage,
  DEFAULT_SLIPPAGE_BPS,
  hasSellAllowance,
  prepareBuy,
  preparePermit2Approval,
  prepareSell,
  quoteExactInput,
} from "@launchpad/sdk";
import { BracketTabs, Button, TxSteps, TypingDots } from "@launchpad/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { track } from "@vercel/analytics";
import { useState } from "react";
import { type Address, erc20Abi } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract } from "wagmi";
import { attribution, ctx } from "@/lib/config";
import { formatEth, formatTokens, parseEthInput } from "@/lib/format";
import { indexer, type Trade } from "@/lib/indexer";
import { useTx } from "@/lib/useTx";

type Side = "buy" | "sell";
const SIDES = [
  { id: "buy", label: "Buy", tone: "buy" },
  { id: "sell", label: "Sell", tone: "sell" },
] as const;
const BUY_PRESETS = ["0.01", "0.05", "0.1"] as const;
const SELL_PRESETS = [25n, 50n, 100n] as const;
/** ETH kept back for gas when using "max". */
const GAS_RESERVE = 10n ** 15n;

/** Buy/Sell box. Desktop: inline. Mobile: sticky bottom bar that opens a sheet. */
export function TradePanel({ token, symbol }: { token: Address; symbol: string }) {
  const [sheet, setSheet] = useState<Side | null>(null);
  return (
    <>
      <div className="hidden lg:block">
        <TradeBox token={token} symbol={symbol} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line bg-bg p-3 lg:hidden">
        <Button variant="buy" onClick={() => setSheet("buy")}>
          [ Buy ]
        </Button>
        <Button variant="sell" onClick={() => setSheet("sell")}>
          [ Sell ]
        </Button>
      </div>
      {sheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Trade $${symbol}`}
          className="fixed inset-0 z-40 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto border-t border-ink bg-bg p-4">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="min-h-11 px-3 font-mono text-sm"
              >
                close ×
              </button>
            </div>
            <TradeBox token={token} symbol={symbol} initialSide={sheet} />
          </div>
        </div>
      )}
    </>
  );
}

function TradeBox({
  token,
  symbol,
  initialSide = "buy",
}: {
  token: Address;
  symbol: string;
  initialSide?: Side;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(String(DEFAULT_SLIPPAGE_BPS / 100n));
  const { address } = useAccount();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const { state, run, reset } = useTx();
  const eth = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 10_000 } });
  const tokens = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });

  const switchSide = (next: Side) => {
    setSide(next);
    reset();
    setAmount("");
  };

  // Buy amounts are typed in ETH; sell amounts are a percentage of the wallet's token balance.
  const amountIn = side === "buy" ? (amount ? parseEthInput(amount) : null) : amount ? BigInt(amount) : null;
  const slippageBps = /^\d{1,2}(\.\d{1,2})?$/.test(slippage)
    ? BigInt(Math.round(Number(slippage) * 100))
    : null;

  const quote = useQuery({
    queryKey: ["quote", token, side, amountIn?.toString()],
    enabled: Boolean(client && amountIn && amountIn > 0n),
    queryFn: () => quoteExactInput(client as never, ctx, { token, side, amountIn: amountIn as bigint }),
    refetchInterval: 8_000,
    retry: false,
  });

  async function submit() {
    if (!address || !client || !amountIn || !quote.data || slippageBps === null) return;
    const minOut = applySlippage(quote.data, slippageBps);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const isIndexed = async (hash: string) =>
      Boolean(
        (await indexer<{ items: Trade[] }>(`/tokens/${token}/trades?limit=20`))?.items.some(
          (t) => t.txHash === hash,
        ),
      );

    let hash: string | undefined;
    if (side === "buy") {
      hash = await run(prepareBuy(ctx, { token, amountInWei: amountIn, minOut, deadline }, attribution), {
        isIndexed,
      });
    } else {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const sell = prepareSell(ctx, { token, amountIn, minOutWei: minOut, deadline }, attribution);
      // First sell of a token: one Permit2 approval (decisions §18), batched where the wallet supports it.
      const approved = await hasSellAllowance(client as never, ctx, {
        owner: address,
        token,
        amount: amountIn,
        nowSeconds: now,
      });
      hash = await run(
        approved ? sell : [preparePermit2Approval(ctx, { token, nowSeconds: now }, attribution), sell],
        {
          isIndexed,
        },
      );
    }
    if (hash) {
      track("trade_signed", { side });
      setAmount("");
      await Promise.all([
        eth.refetch(),
        tokens.refetch(),
        queryClient.invalidateQueries({ queryKey: ["trades", token] }),
      ]);
    }
  }

  const tokenBalance = tokens.data ?? 0n;
  const sellAmount = (pct: bigint) => String((tokenBalance * pct) / 100n);
  const busy = state.step !== "idle" && !state.error && state.step !== "indexed";
  const insufficient =
    amountIn !== null &&
    amountIn > 0n &&
    (side === "buy" ? eth.data !== undefined && amountIn > eth.data.value : amountIn > tokenBalance);

  return (
    <section aria-label={`Trade $${symbol}`} className="grid gap-3 border border-ink p-4">
      <BracketTabs tabs={SIDES} value={side} onChange={switchSide} label="Trade side" />

      {side === "buy" ? (
        <>
          <label className="grid gap-1">
            <span className="font-mono text-xs uppercase">Amount (ETH)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="lp-input min-h-11 border border-line bg-transparent px-3 font-mono text-lg tabular outline-none focus:border-ink"
              placeholder="0.0"
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {BUY_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className="min-h-11 border border-line font-mono text-sm"
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={!eth.data}
              onClick={() =>
                eth.data &&
                setAmount(formatEthInput(eth.data.value > GAS_RESERVE ? eth.data.value - GAS_RESERVE : 0n))
              }
              className="min-h-11 border border-line font-mono text-sm"
            >
              max
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-mono text-xs uppercase">
            Amount{" "}
            <span className="text-mute normal-case">
              · you hold {formatTokens(tokenBalance)} ${symbol}
            </span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SELL_PRESETS.map((p) => (
              <button
                key={String(p)}
                type="button"
                disabled={tokenBalance === 0n}
                aria-pressed={amount !== "" && amount === sellAmount(p)}
                onClick={() => setAmount(sellAmount(p))}
                className="min-h-11 border border-line font-mono text-sm aria-pressed:border-ink"
              >
                {String(p)}%
              </button>
            ))}
          </div>
        </>
      )}

      <p className="min-h-5 font-mono text-sm tabular" aria-live="polite">
        {quote.isFetching && !quote.data ? (
          <TypingDots>quoting</TypingDots>
        ) : quote.data && amountIn ? (
          side === "buy" ? (
            <>
              ≈ {formatTokens(quote.data)} ${symbol} · you sell {formatEth(amountIn)} ETH
            </>
          ) : (
            <>
              ≈ {formatEth(quote.data)} ETH · you sell {formatTokens(amountIn)} ${symbol}
            </>
          )
        ) : quote.error ? (
          <span className="text-sell">No quote: the pool cannot fill this amount.</span>
        ) : null}
      </p>

      <label className="flex items-center justify-between font-mono text-xs">
        <span className="text-mute">Max slippage %</span>
        <input
          inputMode="decimal"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          className="lp-input min-h-11 w-20 border border-line bg-transparent px-2 text-right outline-none focus:border-ink"
          aria-invalid={slippageBps === null}
        />
      </label>

      <Button
        variant={side}
        onClick={submit}
        disabled={!address || !quote.data || busy || insufficient || slippageBps === null}
      >
        {!address
          ? "Connect a wallet"
          : insufficient
            ? side === "buy"
              ? "Not enough ETH"
              : `Not enough $${symbol}`
            : busy
              ? "Working…"
              : `${side === "buy" ? "Buy" : "Sell"} $${symbol}`}
      </Button>
      {state.step !== "idle" && <TxSteps step={state.step} error={state.error} />}
    </section>
  );
}

/** Wei → plain decimal string for the input (no grouping), integer math. */
function formatEthInput(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
