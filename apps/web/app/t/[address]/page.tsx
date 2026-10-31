import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getAddress, hexToString, isAddress } from "viem";
import { Chart } from "@/components/Chart";
import { ReportButton, ShareButton, TopHolders, TradesFeed } from "@/components/TokenActivity";
import { TokenRules } from "@/components/TokenRules";
import { TradePanel } from "@/components/TradePanel";
import { poolFees } from "@/lib/chain";
import { basescan } from "@/lib/config";
import { formatBpsChange, formatEth } from "@/lib/format";
import { trustedImage } from "@/lib/images";
import { indexer, type TokenDetail } from "@/lib/indexer";
import { isHidden } from "@/lib/moderation";

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ launched?: string }> };

async function load(raw: string) {
  if (!isAddress(raw)) return null;
  return indexer<TokenDetail>(`/tokens/${getAddress(raw)}`, { revalidate: 5 });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = await load((await params).address);
  if (!token) return { title: "Token" };
  return {
    title: `$${token.symbol} · ${token.name}`,
    description: token.description || `$${token.symbol} on Base.`,
  };
}

/** Links stored on-chain in the token's metadata extraData ({ v, img, x?, tg? }). */
function extraLinks(extraData: `0x${string}`): { x?: string; tg?: string } {
  try {
    const parsed = JSON.parse(hexToString(extraData)) as { x?: string; tg?: string };
    return { x: parsed.x, tg: parsed.tg };
  } catch {
    return {};
  }
}

const safeUrl = (u: string) => (/^https:\/\//.test(u) ? u : undefined);

export default async function TokenPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { launched } = await searchParams;
  const token = await load(address);
  if (!token) notFound();
  const fees = await poolFees(token.address);
  const change = BigInt(token.change1hBps);
  const links = extraLinks(token.extraData);
  const image = trustedImage(token.image);
  const xHandle = links.x?.replace(/^@/, "").replace(/^https:\/\/(x|twitter)\.com\//, "");
  const tg = links.tg?.replace(/^https:\/\//, "");

  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {isHidden(token.address) && (
        <p role="alert" className="border border-sell p-3 font-mono text-sm text-sell lg:col-span-2">
          This token was reported and is hidden from the board. Check the contract before trading.
        </p>
      )}
      {launched && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-ink p-4 lg:col-span-2">
          <p className="font-pixel text-xl">${token.symbol} IS LIVE</p>
          <ShareButton symbol={token.symbol} />
        </div>
      )}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
        <header className="flex items-center gap-4">
          {image ? (
            <Image
              src={image}
              alt=""
              width={72}
              height={72}
              className="border border-line"
              unoptimized={!image.includes("blob.vercel-storage.com")}
              priority
            />
          ) : (
            <div className="h-[72px] w-[72px] shrink-0 border border-dashed border-line" />
          )}
          <div className="min-w-0">
            <h1 className="truncate font-pixel text-3xl sm:text-4xl">${token.symbol}</h1>
            <p className="truncate text-sm text-mute">{token.name}</p>
          </div>
          <div className="ml-auto shrink-0 text-right font-mono tabular">
            <p className="whitespace-nowrap text-base sm:text-lg">{formatEth(token.marketCapWei)} ETH</p>
            <p className={`text-xs ${change > 0n ? "text-buy" : change < 0n ? "text-sell" : "text-mute"}`}>
              {formatBpsChange(token.change1hBps)} 1h
            </p>
          </div>
        </header>
        {token.description && <p className="max-w-prose text-sm">{token.description}</p>}
        <Chart token={token.address} />
        <div className="lg:hidden">
          <TokenRules
            token={token.address}
            creator={token.creator}
            launchedAt={token.launchedAt}
            fees={fees}
          />
        </div>
        <TradesFeed token={token.address} symbol={token.symbol} />
      </div>

      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
        <TradePanel token={token.address} symbol={token.symbol} />
        <div className="hidden lg:block">
          <TokenRules
            token={token.address}
            creator={token.creator}
            launchedAt={token.launchedAt}
            fees={fees}
          />
        </div>
        <TopHolders token={token.address} />
        <section aria-label="Links" className="flex flex-wrap gap-x-4 font-mono text-xs">
          {safeUrl(token.website) && (
            <a
              href={token.website}
              target="_blank"
              rel="noreferrer nofollow"
              className="min-h-11 content-center"
            >
              website ↗
            </a>
          )}
          {xHandle && /^[A-Za-z0-9_]{1,15}$/.test(xHandle) && (
            <a
              href={`https://x.com/${xHandle}`}
              target="_blank"
              rel="noreferrer nofollow"
              className="min-h-11 content-center"
            >
              x ↗
            </a>
          )}
          {tg && /^t\.me\/[A-Za-z0-9_+/]{1,64}$/.test(tg) && (
            <a
              href={`https://${tg}`}
              target="_blank"
              rel="noreferrer nofollow"
              className="min-h-11 content-center"
            >
              telegram ↗
            </a>
          )}
          <a
            href={basescan.token(token.address)}
            target="_blank"
            rel="noreferrer"
            className="min-h-11 content-center"
          >
            basescan ↗
          </a>
          {!launched && <ShareButton symbol={token.symbol} />}
        </section>
        <ReportButton token={token.address} />
      </aside>
    </article>
  );
}
