import type { Address, Hex } from "viem";
import { encodeAbiParameters, encodePacked, zeroAddress } from "viem";
import { OPEN_DELTA, UR_COMMAND, V4_ACTION } from "./constants.ts";
import type { PoolKey } from "./pool.ts";

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** IV4Router.ExactInputSingleParams @ v4-periphery ad04c9f. */
function encodeExactInputSingle(key: PoolKey, zeroForOne: boolean, amountIn: bigint, minOut: bigint): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: poolKeyComponents },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" }],
  );
}

const actions = (...a: number[]): Hex =>
  encodePacked(
    a.map(() => "uint8"),
    a,
  );

/** A Universal Router program: `execute(commands, inputs, deadline)`. */
export type RouterProgram = { commands: Hex; inputs: Hex[]; deadline: bigint };

/**
 * Exact-input swap paid by the caller (`SETTLE_ALL` / `TAKE_ALL` act on msg.sender).
 * Buys send ETH as msg.value; sells pull the token through Permit2.
 */
export function exactInputSwap(p: {
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minOut: bigint;
  deadline: bigint;
}): RouterProgram {
  const [input, output] = p.zeroForOne
    ? [p.key.currency0, p.key.currency1]
    : [p.key.currency1, p.key.currency0];
  const params = [
    encodeExactInputSingle(p.key, p.zeroForOne, p.amountIn, p.minOut),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [input, p.amountIn]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [output, p.minOut]),
  ];
  return {
    commands: encodePacked(["uint8"], [UR_COMMAND.V4_SWAP]),
    inputs: [
      encodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes[]" }],
        [actions(V4_ACTION.SWAP_EXACT_IN_SINGLE, V4_ACTION.SETTLE_ALL, V4_ACTION.TAKE_ALL), params],
      ),
    ],
    deadline: p.deadline,
  };
}

/**
 * First-buy route run by UniversalRouterStrategy inside the launch multicall. The router pays from
 * the forwarded ETH (`SETTLE`, payerIsUser=false), sends tokens straight to `recipient` (`TAKE` with an
 * explicit recipient, never `TAKE_ALL`, which would strand them in the strategy), then sweeps any ETH
 * left over to `recipient` (audit L-08).
 */
export function firstBuyRoute(p: {
  key: PoolKey;
  recipient: Address;
  amountIn: bigint;
  minOut: bigint;
  deadline: bigint;
}): RouterProgram {
  const params = [
    encodeExactInputSingle(p.key, true, p.amountIn, p.minOut),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
      [zeroAddress, OPEN_DELTA, false],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint256" }],
      [p.key.currency1, p.recipient, OPEN_DELTA],
    ),
  ];
  return {
    commands: encodePacked(["uint8", "uint8"], [UR_COMMAND.V4_SWAP, UR_COMMAND.SWEEP]),
    inputs: [
      encodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes[]" }],
        [actions(V4_ACTION.SWAP_EXACT_IN_SINGLE, V4_ACTION.SETTLE, V4_ACTION.TAKE), params],
      ),
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint256" }],
        [zeroAddress, p.recipient, 0n],
      ),
    ],
    deadline: p.deadline,
  };
}

/** `abi.encode(bytes commands, bytes[] inputs, uint256 deadline)`, as UniversalRouterStrategy decodes it. */
export function encodeRouterProgram(r: RouterProgram): Hex {
  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }, { type: "uint256" }],
    [r.commands, r.inputs, r.deadline],
  );
}
