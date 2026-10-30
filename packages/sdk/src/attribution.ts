import { Attribution as Erc8021 } from "ox/erc8021";
import type { Address, Hex } from "viem";
import { concatHex } from "viem";

/**
 * Builder Code attribution (ERC-8021). Every transaction the app sends must carry it: a missing
 * suffix fails silently (build-on-base skill). The SDK appends it to every prepared transaction, and
 * the web app only accepts `AttributedTx` / `AttributedBatch`, so an unattributed send does not type-check.
 * The wagmi config must NOT also set a client-level `dataSuffix`, or the suffix would be appended twice.
 */
export type Attribution = { readonly code: string; readonly suffix: Hex };

/** A raw contract call before attribution. */
export type Call = { to: Address; data: Hex; value: bigint };

declare const attributed: unique symbol;
/** A call whose `data` ends with our Builder Code suffix. Only produced by `attribute`. */
export type AttributedTx = Call & { readonly [attributed]: true };

/** EIP-5792 `wallet_sendCalls` request: suffix goes in `capabilities` so it lands on the outer userOp callData. */
export type AttributedBatch = {
  calls: readonly AttributedTx[];
  capabilities: { dataSuffix: { value: Hex; optional: true } };
};

const BUILDER_CODE = /^[A-Za-z0-9_-]{1,32}$/;

export function createAttribution(code: string): Attribution {
  if (!BUILDER_CODE.test(code)) throw new Error(`invalid Builder Code: ${JSON.stringify(code)}`);
  return { code, suffix: Erc8021.toDataSuffix({ codes: [code] }) };
}

export function attribute(call: Call, attribution: Attribution): AttributedTx {
  return { ...call, data: concatHex([call.data, attribution.suffix]) } as AttributedTx;
}

export function attributeBatch(calls: readonly Call[], attribution: Attribution): AttributedBatch {
  return {
    calls: calls.map((c) => attribute(c, attribution)),
    capabilities: { dataSuffix: { value: attribution.suffix, optional: true } },
  };
}

/** Builder Codes carried by `data`, or undefined if it has no ERC-8021 suffix. */
export function readBuilderCodes(data: Hex): readonly string[] | undefined {
  const parsed = Erc8021.fromData(data);
  return parsed && "codes" in parsed ? parsed.codes : undefined;
}

/** `data` with the attribution suffix removed (the original ABI calldata). */
export function stripAttribution(data: Hex, attribution: Attribution): Hex {
  if (!data.toLowerCase().endsWith(attribution.suffix.slice(2).toLowerCase())) {
    throw new Error("calldata does not end with the Builder Code suffix");
  }
  return data.slice(0, data.length - (attribution.suffix.length - 2)) as Hex;
}
