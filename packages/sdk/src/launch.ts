import type { Address, Hex } from "viem";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, getAddress, zeroHash } from "viem";
import { liquidityLauncherAbi } from "./abis.generated.ts";
import type { LaunchpadContext } from "./addresses.ts";
import { type AttributedTx, type Attribution, attribute, type Call } from "./attribution.ts";
import { TOKEN_DECIMALS, TOTAL_SUPPLY } from "./constants.ts";
import { type PoolKey, poolKeyFor, predictTokenAddress } from "./pool.ts";
import { encodeRouterProgram, firstBuyRoute } from "./router.ts";

/** UERC20Metadata: stored on the token. `extraData` carries the hash of the off-chain metadata. */
export type TokenMetadata = { description: string; website: string; image: string; extraData: Hex };

export type LaunchParams = {
  creator: Address;
  name: string;
  symbol: string;
  metadata: TokenMetadata;
  /** Optional creator first buy in wei, executed in the same transaction. */
  firstBuyWei?: bigint;
  /**
   * Minimum tokens for the first buy. The pool is created in the same transaction, so the output is
   * deterministic; callers may pass a simulated amount minus slippage.
   */
  firstBuyMinOut?: bigint;
  /** Unix seconds; only used by the first-buy route. */
  deadline: bigint;
};

export type PreparedLaunch = { tx: AttributedTx; token: Address; poolKey: PoolKey };

const NAME_MAX = 32;
const SYMBOL = /^[A-Z0-9]{1,10}$/;

export function validateLaunchParams(p: LaunchParams): void {
  const name = p.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) throw new Error(`name must be 1-${NAME_MAX} characters`);
  if (name !== p.name) throw new Error("name has leading or trailing spaces");
  if (!SYMBOL.test(p.symbol)) throw new Error("ticker must be 1-10 characters, A-Z or 0-9");
  if ((p.firstBuyWei ?? 0n) < 0n || (p.firstBuyMinOut ?? 0n) < 0n) throw new Error("negative amount");
}

/**
 * The only way the SDK builds a launch: ONE `LiquidityLauncher.multicall` holding
 * `createToken(recipient = launcher)` and `distributeToken` (and optionally the first buy).
 * Tokens left in the launcher between transactions can be taken by anyone (docs/decisions.md §7).
 */
function buildLaunchCall(ctx: LaunchpadContext, p: LaunchParams): { call: Call; token: Address } {
  validateLaunchParams(p);
  const launcher = ctx.external.liquidityLauncher;
  const token = predictTokenAddress(ctx, p);
  const firstBuy = p.firstBuyWei ?? 0n;

  const calls: Hex[] = [
    encodeFunctionData({
      abi: liquidityLauncherAbi,
      functionName: "createToken",
      args: [
        ctx.deployment.tokenFactory,
        p.name,
        p.symbol,
        TOKEN_DECIMALS,
        TOTAL_SUPPLY,
        launcher,
        encodeAbiParameters(
          [
            {
              type: "tuple",
              components: [
                { name: "description", type: "string" },
                { name: "website", type: "string" },
                { name: "image", type: "string" },
                { name: "extraData", type: "bytes" },
              ],
            },
          ],
          [p.metadata],
        ),
      ],
    }),
    encodeFunctionData({
      abi: liquidityLauncherAbi,
      functionName: "distributeToken",
      args: [
        token,
        {
          strategy: ctx.deployment.instantLaunchStrategy,
          amount: TOTAL_SUPPLY,
          configData: encodeAbiParameters([{ type: "address" }], [p.creator]),
        },
        zeroHash,
      ],
    }),
  ];

  if (firstBuy > 0n) {
    const route = firstBuyRoute({
      key: poolKeyFor(token),
      recipient: p.creator,
      amountIn: firstBuy,
      minOut: p.firstBuyMinOut ?? 0n,
      deadline: p.deadline,
    });
    calls.push(
      encodeFunctionData({
        abi: liquidityLauncherAbi,
        functionName: "distributeWithNative",
        args: [
          ctx.deployment.universalRouterStrategy,
          // abi.encode(UniversalRouterConfig{router, recipient, route}): a struct with a dynamic member
          // encodes as ONE tuple (leading offset), not three loose parameters.
          encodeAbiParameters(
            [
              {
                type: "tuple",
                components: [
                  { name: "router", type: "address" },
                  { name: "recipient", type: "address" },
                  { name: "route", type: "bytes" },
                ],
              },
            ],
            [
              {
                router: ctx.external.universalRouter,
                recipient: p.creator,
                route: encodeRouterProgram(route),
              },
            ],
          ),
          zeroHash,
          firstBuy,
        ],
      }),
    );
  }

  const data = encodeFunctionData({ abi: liquidityLauncherAbi, functionName: "multicall", args: [calls] });
  const call = { to: launcher, data, value: firstBuy };
  assertAtomicLaunch(ctx, call, p.creator);
  return { call, token };
}

export function prepareLaunch(
  ctx: LaunchpadContext,
  p: LaunchParams,
  attribution: Attribution,
): PreparedLaunch {
  const { call, token } = buildLaunchCall(ctx, p);
  return { tx: attribute(call, attribution), token, poolKey: poolKeyFor(token) };
}

/**
 * Rejects any LiquidityLauncher call from `sender` that mints a token into the launcher without
 * distributing that same token (full supply) to our InstantLaunchStrategy in the same multicall.
 * Runs on every launch the SDK builds; tests also run it against hand-built unsafe shapes.
 */
export function assertAtomicLaunch(
  ctx: LaunchpadContext,
  call: Pick<Call, "to" | "data">,
  sender: Address,
): void {
  if (getAddress(call.to) !== ctx.external.liquidityLauncher) return;
  const outer = decodeFunctionData({ abi: liquidityLauncherAbi, data: call.data });
  if (outer.functionName === "createToken" || outer.functionName === "distributeToken") {
    throw new Error("unsafe launch: createToken/distributeToken must be inside one multicall");
  }
  if (outer.functionName !== "multicall") return;

  const inner = outer.args[0].map((d) => decodeFunctionData({ abi: liquidityLauncherAbi, data: d }));
  const creates = inner.filter((c) => c.functionName === "createToken");
  if (creates.length > 1) throw new Error("unsafe launch: one token per transaction");

  for (const c of creates) {
    if (c.functionName !== "createToken") continue;
    const [factory, name, symbol, , supply, recipient] = c.args;
    if (getAddress(factory) !== ctx.deployment.tokenFactory)
      throw new Error("unsafe launch: unknown token factory");
    if (getAddress(recipient) !== ctx.external.liquidityLauncher) {
      throw new Error("unsafe launch: createToken recipient must be the launcher");
    }
    const token = predictTokenAddress(ctx, { creator: sender, name, symbol });
    const distributed = inner.some(
      (d) =>
        d.functionName === "distributeToken" &&
        getAddress(d.args[0]) === token &&
        getAddress(d.args[1].strategy) === ctx.deployment.instantLaunchStrategy &&
        d.args[1].amount === supply,
    );
    if (!distributed)
      throw new Error("unsafe launch: createToken without distributeToken in the same multicall");
  }
}
