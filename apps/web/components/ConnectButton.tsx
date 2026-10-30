"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";

const LABELS: Record<string, string> = { injected: "Browser wallet", baseAccount: "Base Account" };

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!mounted) return <span className="inline-block min-h-11 w-24" aria-hidden />;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm">
        <Link href={`/u/${address}`} className="min-h-11 content-center px-2 tabular">
          {shortAddress(address)}
        </Link>
        <button
          type="button"
          onClick={() => disconnect()}
          className="min-h-11 px-2 text-mute"
          aria-label="Disconnect wallet"
        >
          ×
        </button>
      </div>
    );
  }

  // In the Base App (and other in-app browsers) the injected wallet is the only sensible choice.
  const unique = connectors.filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  return (
    <div className="relative" ref={menu}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() =>
          unique.length === 1 && unique[0] ? connect({ connector: unique[0] }) : setOpen((o) => !o)
        }
        className="min-h-11 border border-ink px-4 font-mono text-sm uppercase"
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 border border-ink bg-bg font-mono text-sm"
        >
          {unique.map((c) => (
            <button
              key={c.uid}
              type="button"
              role="menuitem"
              onClick={() => {
                connect({ connector: c });
                setOpen(false);
              }}
              className="block min-h-11 w-full px-3 text-left hover:bg-ink hover:text-bg"
            >
              {c.type === "injected" && c.name !== "Injected" ? c.name : (LABELS[c.type] ?? c.name)}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="absolute right-0 mt-1 w-60 font-mono text-xs text-sell">
          {error.name === "UserRejectedRequestError" ? "Connection rejected." : "Could not connect."}
        </p>
      )}
    </div>
  );
}
