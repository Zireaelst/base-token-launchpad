import "server-only";
import { LP_FEE, poolIdFor, poolKeyFor, stateViewAbi } from "@launchpad/sdk";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { ctx } from "./config";

/** Server-side reads with the private RPC URL. */
export const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });

/**
 * Pool fees read from chain. `protocolFee` is packed (0->1 in the low 12 bits, 1->0 in the next 12) and
 * set at launch by Uniswap's fee adapter; governance can change it, so it is never hard-coded.
 */
export async function poolFees(
  token: Address,
): Promise<{ lpFee: number; protocolBuy: number; protocolSell: number } | null> {
  try {
    const [, , protocolFee, lpFee] = await publicClient.readContract({
      address: ctx.external.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [poolIdFor(poolKeyFor(token))],
    });
    return { lpFee: lpFee || LP_FEE, protocolBuy: protocolFee & 0xfff, protocolSell: protocolFee >> 12 };
  } catch {
    return null;
  }
}
