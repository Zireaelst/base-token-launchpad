import { Analytics } from "@vercel/analytics/next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelGrid, GeistPixelLine, GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Providers } from "@/components/Providers";
import { BRAND } from "@/lib/brand";
import { makeWagmiConfig } from "@/lib/wagmi";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${BRAND} · Launch a token on Base`, template: `%s · ${BRAND}` },
  description:
    "Fixed supply. Locked liquidity. Creators earn 60% of LP fees, in ETH. Launch a token on Base in one signature.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(makeWagmiConfig(), (await headers()).get("cookie"));
  const fonts = [GeistSans, GeistMono, GeistPixelSquare, GeistPixelGrid, GeistPixelLine]
    .map((f) => f.variable)
    .join(" ");
  return (
    <html lang="en" className={fonts}>
      <body className="min-h-dvh bg-bg text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          Skip to content
        </a>
        <Providers initialState={initialState}>
          <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
            <Link href="/" className="min-h-11 content-center font-pixel text-lg uppercase tracking-wider">
              {BRAND}
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 font-mono text-sm">
              <Link href="/create" className="hidden min-h-11 content-center px-2 sm:block">
                Create
              </Link>
              <Link href="/stats" className="hidden min-h-11 content-center px-2 sm:block">
                Stats
              </Link>
              <ConnectButton />
            </nav>
          </header>
          <main id="main" className="mx-auto max-w-6xl px-4 pb-28">
            {children}
          </main>
          <footer className="mx-auto max-w-6xl px-4 py-8 font-mono text-xs text-mute">
            Built on audited Uniswap Liquidity Launcher contracts on Base. Tokens can lose all value. Nothing
            here is financial advice.
          </footer>
        </Providers>
        {/* The analytics script is served by Vercel; elsewhere it would 404. */}
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  );
}
