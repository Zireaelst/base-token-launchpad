/**
 * End-to-end against a local anvil fork of Base with our contracts deployed:
 *   bash packages/contracts/script/local-fork.sh   (writes packages/contracts/deployments/local.json)
 *   pnpm --filter @launchpad/sdk test:fork
 */
import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  maxUint256,
  parseEther,
} from "viem";
import { base } from "viem/chains";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AttributedTx,
  applySlippage,
  beneficiaryVaultAbi,
  createContext,
  DEFAULT_SLIPPAGE_BPS,
  hasSellAllowance,
  poolIdFor,
  prepareBuy,
  prepareClaimAllSequential,
  prepareLaunch,
  preparePermit2Approval,
  prepareSell,
  quoteExactInput,
  readBuilderCodes,
  stateViewAbi,
  uerc20FactoryAbi,
} from "../src/index.ts";
import { attribution, metadata } from "./fixtures.ts";

const local = JSON.parse(
  readFileSync(new URL("../../contracts/deployments/local.json", import.meta.url), "utf8"),
) as { rpcUrl: string; treasury: Address } & Parameters<typeof createContext>[0];

const ctx = createContext(local);
const transport = http(local.rpcUrl);
const publicClient = createPublicClient({ chain: base, transport });
const testClient = createTestClient({ chain: base, mode: "anvil", transport });
// No client-level dataSuffix: the SDK already attributed every tx (see src/attribution.ts).
const wallet = createWalletClient({ chain: base, transport });

const creator: Address = "0x00000000000000000000000000000000c0ffee01";
const trader: Address = "0x00000000000000000000000000000000c0ffee02";

async function send(from: Address, tx: AttributedTx): Promise<Hex> {
  const hash = await wallet.sendTransaction({
    account: from,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    chain: base,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  // The Builder Code is on the transaction as it landed on-chain.
  const onchain = await publicClient.getTransaction({ hash });
  expect(readBuilderCodes(onchain.input)).toEqual([attribution.code]);
  return hash;
}

const now = async () => (await publicClient.getBlock()).timestamp;

describe("SDK against a Base fork", () => {
  let token: Address;
  let tokenId: bigint;

  beforeAll(async () => {
    for (const who of [creator, trader]) {
      await testClient.impersonateAccount({ address: who });
      await testClient.setBalance({ address: who, value: parseEther("100") });
    }
  });

  it("launches with a first buy in one attributed transaction", async () => {
    tokenId = await publicClient.readContract({
      address: ctx.external.positionManager,
      abi: [
        {
          type: "function",
          name: "nextTokenId",
          inputs: [],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        },
      ],
      functionName: "nextTokenId",
    });
    const name = `Fork ${Date.now() % 1_000_000}`;
    const launch = prepareLaunch(
      ctx,
      {
        creator,
        name,
        symbol: "FORK",
        metadata,
        deadline: (await now()) + 600n,
        firstBuyWei: parseEther("0.05"),
      },
      attribution,
    );
    token = launch.token;

    // Offline prediction matches the factory's own view.
    const onchainPrediction = await publicClient.readContract({
      address: ctx.deployment.tokenFactory,
      abi: uerc20FactoryAbi,
      functionName: "getUERC20Address",
      args: [name, "FORK", 18, ctx.external.liquidityLauncher, await graffiti(creator)],
    });
    expect(onchainPrediction).toBe(token);

    await send(creator, launch.tx);
    expect(
      await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
    ).toBe(10n ** 27n);
    expect(
      await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [creator],
      }),
    ).toBeGreaterThan(0n);
    const [, , , lpFee] = await publicClient.readContract({
      address: ctx.external.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [poolIdFor(launch.poolKey)],
    });
    expect(lpFee).toBe(2_500);
  });

  it("buys with a quote, minOut and deadline", async () => {
    const amountInWei = parseEther("0.2");
    const quoted = await quoteExactInput(publicClient, ctx, { token, side: "buy", amountIn: amountInWei });
    const before = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [trader],
    });
    await send(
      trader,
      prepareBuy(
        ctx,
        {
          token,
          amountInWei,
          minOut: applySlippage(quoted, DEFAULT_SLIPPAGE_BPS),
          deadline: (await now()) + 600n,
        },
        attribution,
      ),
    );
    const after = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [trader],
    });
    expect(after - before).toBe(quoted);
  });

  it("sells through Permit2 (UERC20 pre-approves Permit2)", async () => {
    expect(
      await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [trader, ctx.external.permit2],
      }),
    ).toBe(maxUint256);

    const amountIn =
      (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [trader],
      })) / 2n;
    const t = await now();
    expect(
      await hasSellAllowance(publicClient, ctx, { owner: trader, token, amount: amountIn, nowSeconds: t }),
    ).toBe(false);
    await send(trader, preparePermit2Approval(ctx, { token, nowSeconds: t }, attribution));
    expect(
      await hasSellAllowance(publicClient, ctx, { owner: trader, token, amount: amountIn, nowSeconds: t }),
    ).toBe(true);

    const quoted = await quoteExactInput(publicClient, ctx, { token, side: "sell", amountIn });
    const before = await publicClient.getBalance({ address: trader });
    const hash = await send(
      trader,
      prepareSell(
        ctx,
        { token, amountIn, minOutWei: applySlippage(quoted, DEFAULT_SLIPPAGE_BPS), deadline: t + 600n },
        attribution,
      ),
    );
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const gas = receipt.gasUsed * receipt.effectiveGasPrice;
    expect((await publicClient.getBalance({ address: trader })) + gas - before).toBe(quoted);
  });

  it("creator claims fees: collect + claim", async () => {
    const ownerOf = await publicClient.readContract({
      address: ctx.deployment.beneficiaryVault,
      abi: beneficiaryVaultAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    expect(getAddress(ownerOf)).toBe(getAddress(creator));

    const before = await publicClient.getBalance({ address: creator });
    let gas = 0n;
    for (const tx of prepareClaimAllSequential(ctx, [tokenId], attribution)) {
      const r = await publicClient.getTransactionReceipt({ hash: await send(creator, tx) });
      gas += r.gasUsed * r.effectiveGasPrice;
    }
    const earned = (await publicClient.getBalance({ address: creator })) + gas - before;
    expect(earned).toBeGreaterThan(0n);
    console.log(`creator claimed ${earned} wei`);
  });
});

async function graffiti(who: Address): Promise<Hex> {
  return publicClient.readContract({
    address: ctx.external.liquidityLauncher,
    abi: [
      {
        type: "function",
        name: "getGraffiti",
        inputs: [{ type: "address" }],
        outputs: [{ type: "bytes32" }],
        stateMutability: "pure",
      },
    ],
    functionName: "getGraffiti",
    args: [who],
  });
}
