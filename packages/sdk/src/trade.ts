import type { Address, Client } from "viem";
import { encodeFunctionData } from "viem";
import { readContract, simulateContract } from "viem/actions";
import type { LaunchpadContext } from "./addresses.ts";
import { type AttributedTx, type Attribution, attribute } from "./attribution.ts";
import { BPS, MAX_UINT160, PERMIT2_EXPIRY_SECONDS } from "./constants.ts";
import { permit2Abi, universalRouterAbi, v4QuoterAbi } from "./externalAbis.ts";
import { poolKeyFor } from "./pool.ts";
import { exactInputSwap } from "./router.ts";

export type TradeSide = "buy" | "sell";

/** `amount * (1 - slippageBps / 10_000)`, rounded down. Integer math only. */
export function applySlippage(amount: bigint, slippageBps: bigint): bigint {
  if (slippageBps < 0n || slippageBps >= BPS) throw new Error("slippage must be in [0, 10000) bps");
  return (amount * (BPS - slippageBps)) / BPS;
}

/** Exact-input quote from the V4 Quoter (simulated with eth_call; the quoter is not a view). */
export async function quoteExactInput(
  client: Client,
  ctx: LaunchpadContext,
  p: { token: Address; side: TradeSide; amountIn: bigint },
): Promise<bigint> {
  const { result } = await simulateContract(client, {
    address: ctx.external.v4Quoter,
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      { poolKey: poolKeyFor(p.token), zeroForOne: p.side === "buy", exactAmount: p.amountIn, hookData: "0x" },
    ],
  });
  return result[0];
}

/** Buy `token` with exactly `amountInWei` ETH; reverts unless at least `minOut` tokens arrive. */
export function prepareBuy(
  ctx: LaunchpadContext,
  p: { token: Address; amountInWei: bigint; minOut: bigint; deadline: bigint },
  attribution: Attribution,
): AttributedTx {
  if (p.amountInWei <= 0n) throw new Error("amount must be positive");
  const program = exactInputSwap({
    key: poolKeyFor(p.token),
    zeroForOne: true,
    amountIn: p.amountInWei,
    minOut: p.minOut,
    deadline: p.deadline,
  });
  return attribute(
    {
      to: ctx.external.universalRouter,
      data: encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [program.commands, program.inputs, program.deadline],
      }),
      value: p.amountInWei,
    },
    attribution,
  );
}

/**
 * Sell exactly `amountIn` tokens for ETH. The router pulls tokens through Permit2; UERC20 grants
 * Permit2 an infinite ERC-20 allowance by default, so only a Permit2 allowance for the router is needed
 * (see `preparePermit2Approval`, once per token and expiry).
 */
export function prepareSell(
  ctx: LaunchpadContext,
  p: { token: Address; amountIn: bigint; minOutWei: bigint; deadline: bigint },
  attribution: Attribution,
): AttributedTx {
  if (p.amountIn <= 0n) throw new Error("amount must be positive");
  const program = exactInputSwap({
    key: poolKeyFor(p.token),
    zeroForOne: false,
    amountIn: p.amountIn,
    minOut: p.minOutWei,
    deadline: p.deadline,
  });
  return attribute(
    {
      to: ctx.external.universalRouter,
      data: encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [program.commands, program.inputs, program.deadline],
      }),
      value: 0n,
    },
    attribution,
  );
}

/** Permit2 allowance letting the Universal Router pull `token` for sells. */
export function preparePermit2Approval(
  ctx: LaunchpadContext,
  p: { token: Address; nowSeconds: bigint },
  attribution: Attribution,
): AttributedTx {
  return attribute(
    {
      to: ctx.external.permit2,
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: "approve",
        args: [
          p.token,
          ctx.external.universalRouter,
          MAX_UINT160,
          Number(p.nowSeconds + PERMIT2_EXPIRY_SECONDS),
        ],
      }),
      value: 0n,
    },
    attribution,
  );
}

/** True if the router can pull `amount` of `token` from `owner` via Permit2 right now. */
export async function hasSellAllowance(
  client: Client,
  ctx: LaunchpadContext,
  p: { owner: Address; token: Address; amount: bigint; nowSeconds: bigint },
): Promise<boolean> {
  const [amount, expiration] = await readContract(client, {
    address: ctx.external.permit2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [p.owner, p.token, ctx.external.universalRouter],
  });
  return amount >= p.amount && BigInt(expiration) > p.nowSeconds;
}
