"use client";

import { prepareLaunch } from "@launchpad/sdk";
import { Button, DitherImage, TxSteps, TypingDots } from "@launchpad/ui";
import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { type Hex, toHex } from "viem";
import { useAccount } from "wagmi";
import { type Fees, TokenRules } from "@/components/TokenRules";
import { attribution, ctx, flags } from "@/lib/config";
import { parseEthInput } from "@/lib/format";
import { indexer, type TokenListItem } from "@/lib/indexer";
import { useTx } from "@/lib/useTx";

type Upload = { url: string; sha256: Hex };

export function CreateForm({ fees }: { fees: Fees }) {
  const router = useRouter();
  const { address } = useAccount();
  const { state, run } = useTx();

  const [image, setImage] = useState<Upload | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [firstBuy, setFirstBuy] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<TokenListItem | null>(null);
  const started = useRef(false);

  const markStarted = () => {
    if (!started.current) {
      started.current = true;
      track("create_started");
    }
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    markStarted();
    setUploadError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body }).catch(() => null);
    setUploading(false);
    const json = (await res?.json().catch(() => null)) as (Upload & { error?: string }) | null;
    if (!res?.ok || !json?.url) {
      setImage(null);
      setUploadError(json?.error ?? "Upload failed. Try another image.");
      return;
    }
    setImage({ url: json.url, sha256: json.sha256 });
  }

  async function checkDuplicate(ticker: string) {
    if (!ticker) return setDuplicate(null);
    const res = await indexer<{ items: TokenListItem[] }>(
      `/tokens?tab=new&limit=5&q=${encodeURIComponent(ticker)}`,
    );
    setDuplicate(res?.items.find((t) => t.symbol === ticker) ?? null);
  }

  const firstBuyWei = firstBuy ? parseEthInput(firstBuy) : 0n;
  const busy = uploading || (state.step !== "idle" && !state.error && state.step !== "indexed");

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!address) return setFormError("Connect a wallet first.");
    if (firstBuyWei === null) return setFormError("First buy must be an ETH amount like 0.01.");
    if (!image) return setFormError(uploading ? "Wait for the image to finish uploading." : "Add an image.");

    const mod = (await fetch("/api/moderate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, symbol, description }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: true }))) as { ok: boolean; message?: string };
    if (!mod.ok) return setFormError(mod.message ?? "Not allowed.");

    let prepared: ReturnType<typeof prepareLaunch>;
    try {
      // Extra links and the image hash live on-chain in the token's metadata extraData.
      const extra = JSON.stringify({
        v: 1,
        img: image.sha256,
        ...(x && { x }),
        ...(telegram && { tg: telegram }),
      });
      prepared = prepareLaunch(
        ctx,
        {
          creator: address,
          name,
          symbol,
          metadata: { description, website, image: image.url, extraData: toHex(extra) },
          firstBuyWei,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
        },
        attribution,
      );
    } catch (err) {
      return setFormError(err instanceof Error ? err.message : "Check the form.");
    }

    // Form state is kept on any error, so a rejected signature loses nothing.
    const hash = await run(prepared.tx, {
      sponsor: flags.sponsorFirstLaunch,
      isIndexed: async () => Boolean(await indexer(`/tokens/${prepared.token}`)),
    });
    if (hash) {
      track("launch_signed");
      router.push(`/t/${prepared.token}?launched=1`);
    }
  }

  const ticker = symbol || "TICKER";
  return (
    <form
      onSubmit={launch}
      className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
      noValidate
    >
      <div className="grid gap-5">
        <label
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-ink p-4 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
        >
          {preview ? (
            // biome-ignore lint/performance/noImgElement: local object URL preview before upload completes
            <img src={preview} alt="Selected token" className="h-24 w-24 object-cover" />
          ) : (
            <span className="font-pixel text-lg">DROP IMAGE</span>
          )}
          <span className="font-mono text-xs text-mute">
            {uploading ? (
              <TypingDots>uploading</TypingDots>
            ) : (
              "PNG, JPG, WebP or GIF · max 2 MB · or click to choose"
            )}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
            aria-label="Token image"
          />
        </label>
        {uploadError && (
          <p role="alert" className="font-mono text-xs text-sell">
            {uploadError}
          </p>
        )}

        <Field label="Name" hint="1-32 characters">
          {(id) => (
            <input
              id={id}
              required
              maxLength={32}
              value={name}
              onChange={(e) => {
                markStarted();
                setName(e.target.value);
              }}
              className={inputClass}
              placeholder="Dot Coin"
            />
          )}
        </Field>
        <Field label="Ticker" hint="A-Z and 0-9, up to 10">
          {(id) => (
            <input
              id={id}
              required
              maxLength={10}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onBlur={() => checkDuplicate(symbol)}
              className={`${inputClass} font-pixel uppercase`}
              placeholder="DOT"
            />
          )}
        </Field>
        {duplicate && (
          <p className="font-mono text-xs">
            Heads up: ${duplicate.symbol} already exists ({duplicate.name}). You can still launch, but buyers
            may confuse them.
          </p>
        )}
        <Field label="Description" hint="optional">
          {(id) => (
            <textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={280}
              className={inputClass}
            />
          )}
        </Field>
        <details className="font-mono text-sm">
          <summary className="min-h-11 cursor-pointer content-center">Links (optional)</summary>
          <div className="mt-2 grid gap-3">
            <Field label="Website">
              {(id) => (
                <input
                  id={id}
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputClass}
                  placeholder="https://"
                />
              )}
            </Field>
            <Field label="X">
              {(id) => (
                <input
                  id={id}
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                  className={inputClass}
                  placeholder="@handle"
                />
              )}
            </Field>
            <Field label="Telegram">
              {(id) => (
                <input
                  id={id}
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className={inputClass}
                  placeholder="t.me/…"
                />
              )}
            </Field>
          </div>
        </details>
        <Field label="First buy (ETH)" hint="optional · bought in the same transaction, before anyone else">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={firstBuy}
              onChange={(e) => setFirstBuy(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          )}
        </Field>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? <TypingDots>launching</TypingDots> : `Launch $${ticker}`}
        </Button>
        {(state.step !== "idle" || formError) && (
          <TxSteps step={state.step === "idle" ? "quote" : state.step} error={formError ?? state.error} />
        )}
      </div>

      <aside aria-label="Preview" className="grid min-w-0 content-start gap-4 border border-line p-4">
        <div className="flex items-center gap-3">
          {image ? (
            <DitherImage src={image.url} size={56} alt="" />
          ) : (
            <div className="h-14 w-14 border border-dashed border-line" />
          )}
          <div>
            <p className="font-pixel text-2xl">${ticker}</p>
            <p className="text-sm text-mute">{name || "Token name"}</p>
          </div>
        </div>
        {description && <p className="text-sm">{description}</p>}
        <TokenRules creator={address} fees={fees} />
      </aside>
    </form>
  );
}

const inputClass =
  "lp-input w-full min-h-11 border border-line bg-transparent px-3 font-mono text-sm outline-none focus:border-ink";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-mono text-xs uppercase">
        {label} {hint && <span className="normal-case text-mute">· {hint}</span>}
      </label>
      {children(id)}
    </div>
  );
}
