/** Mirrors the immutable constants of InstantLaunchStrategy @ 1c59049 (re-checked on-chain after deploy). */
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const TOKEN_DECIMALS = 18;
/** LP fee in pips (0.25%). */
export const LP_FEE = 2_500;
export const TICK_SPACING = 25;
/** Opening tick of our deployment (docs/decisions.md §5). */
export const INITIAL_TICK = 198_050;
/** Creator / platform split of LP fees in bps (docs/decisions.md §4, T1). */
export const CREATOR_BPS = 6_000n;
export const PLATFORM_BPS = 4_000n;
export const BPS = 10_000n;

/** Default slippage for new tokens (5%), editable by the user. */
export const DEFAULT_SLIPPAGE_BPS = 500n;

/** universal-router Commands. */
export const UR_COMMAND = { V4_SWAP: 0x10, SWEEP: 0x04 } as const;

/** v4-periphery Actions @ the launcher's pinned v4-periphery (ad04c9f). */
export const V4_ACTION = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
} as const;

/** v4-periphery ActionConstants.OPEN_DELTA: settle/take the full open delta. */
export const OPEN_DELTA = 0n;

export const MAX_UINT160 = (1n << 160n) - 1n;
/** Permit2 allowance window granted to the Universal Router for sells (same as Uniswap's interface). */
export const PERMIT2_EXPIRY_SECONDS = 30n * 24n * 60n * 60n;
