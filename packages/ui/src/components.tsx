import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** Black square button. Touch target >= 44px. */
export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "buy" | "sell" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center px-5 font-mono text-sm uppercase tracking-wide",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "solid" && "bg-ink text-bg",
        variant === "outline" && "border border-ink text-ink",
        variant === "buy" && "bg-buy text-white",
        variant === "sell" && "bg-sell text-white",
        className,
      )}
    />
  );
}

/** `[ BUY ]` / `[ SELL ]` style tabs. Uses a real tablist for screen readers. */
export function BracketTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: string; tone?: "buy" | "sell" }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 font-mono text-sm">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              "min-h-11 px-2 uppercase",
              active
                ? t.tone === "buy"
                  ? "text-buy"
                  : t.tone === "sell"
                    ? "text-sell"
                    : "text-ink"
                : "text-mute",
            )}
          >
            {active ? `[ ${t.label} ]` : `  ${t.label}  `}
          </button>
        );
      })}
    </div>
  );
}

/** Loading text whose dots "type" in. Static under reduced motion. */
export function TypingDots({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono">
      {children}
      <span className="lp-dots" aria-hidden />
    </span>
  );
}

export type RulesCardRow = { label: string; value: ReactNode; href?: string };

/**
 * Box-drawn rules card: the plain-words contract facts, each linked to its proof on BaseScan.
 * Rendered as a definition list inside an ASCII frame; the frame is decorative (aria-hidden).
 */
export function RulesCard({ rows, title = "RULES" }: { rows: RulesCardRow[]; title?: string }) {
  return (
    <section aria-label="Token rules" className="min-w-0 font-mono text-[13px] leading-6 text-ink">
      <div aria-hidden className="select-none overflow-hidden whitespace-nowrap text-mute">
        {`┌─ ${title} ${"─".repeat(80)}`}
      </div>
      <dl className="border-x border-dashed border-line px-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[10ch_minmax(0,1fr)] gap-x-3 py-0.5">
            <dt className="text-mute">{r.label}</dt>
            <dd className="min-w-0 break-words">
              {r.href ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {r.value} <span aria-hidden>↗</span>
                  <span className="sr-only"> (opens BaseScan)</span>
                </a>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="select-none overflow-hidden whitespace-nowrap text-mute">
        {`└${"─".repeat(84)}`}
      </div>
    </section>
  );
}

export type TxStep = "quote" | "confirm" | "submitted" | "confirmed" | "indexed";
const STEPS: { id: TxStep; label: string }[] = [
  { id: "quote", label: "quote" },
  { id: "confirm", label: "confirm in wallet" },
  { id: "submitted", label: "submitted" },
  { id: "confirmed", label: "confirmed" },
  { id: "indexed", label: "indexed" },
];

/** Shared transaction progress: quote → confirm in wallet → submitted → confirmed → indexed. */
export function TxSteps({ step, error }: { step: TxStep | "idle"; error?: string }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="font-mono text-xs" aria-live="polite">
      <ol className="flex flex-wrap gap-x-2 gap-y-1">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={cx(i < current && "text-ink", i === current && "text-ink", i > current && "text-mute")}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? "■" : i === current ? (error ? "×" : "▣") : "□"} {s.label}
            {i < STEPS.length - 1 && <span className="text-mute"> ›</span>}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sell">
          {error}
        </p>
      )}
    </div>
  );
}
