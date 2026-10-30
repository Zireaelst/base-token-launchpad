import type { Address, Hex } from "viem";
import { encodeAbiParameters, getContractAddress, keccak256, zeroAddress } from "viem";
import { UERC20_INIT_CODE_HASH } from "./abis.generated.ts";
import type { LaunchpadContext } from "./addresses.ts";
import { LP_FEE, TICK_SPACING, TOKEN_DECIMALS } from "./constants.ts";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** The pool every launch creates: native ETH / token, 0.25% LP fee, tick spacing 25, no hook. */
export function poolKeyFor(token: Address): PoolKey {
  return {
    currency0: zeroAddress,
    currency1: token,
    fee: LP_FEE,
    tickSpacing: TICK_SPACING,
    hooks: zeroAddress,
  };
}

export function poolIdFor(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/** LiquidityLauncher.getGraffiti: keccak256(abi.encode(creator)). */
export function graffitiOf(creator: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }], [creator]));
}

/**
 * Address the token will have, computed offline exactly like UERC20Factory.getUERC20Address:
 * the factory's `creator` is the LiquidityLauncher (its msg.sender) and the user is bound via graffiti.
 */
export function predictTokenAddress(
  ctx: LaunchpadContext,
  p: { creator: Address; name: string; symbol: string },
): Address {
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "uint8" }, { type: "address" }, { type: "bytes32" }],
      [p.name, p.symbol, TOKEN_DECIMALS, ctx.external.liquidityLauncher, graffitiOf(p.creator)],
    ),
  );
  return getContractAddress({
    opcode: "CREATE2",
    from: ctx.deployment.tokenFactory,
    salt,
    bytecodeHash: UERC20_INIT_CODE_HASH,
  });
}
