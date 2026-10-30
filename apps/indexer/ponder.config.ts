import { beneficiaryVaultAbi, feeSplitterAbi, instantLaunchStrategyAbi, uerc20Abi } from "@launchpad/sdk";
import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";
import { deployment, startBlock } from "./src/addresses";

const rpc = process.env.PONDER_RPC_URL_8453 ?? process.env.BASE_RPC_URL;
if (!rpc) throw new Error("set PONDER_RPC_URL_8453 or BASE_RPC_URL");

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    base: { id: 8453, rpc, pollingInterval: 1_000 },
  },
  contracts: {
    // Handlers fetch the launch receipt: it carries the factory's TokenCreated (metadata) and the vault's
    // beneficiary mint (creator).
    InstantLaunchStrategy: {
      chain: "base",
      abi: instantLaunchStrategyAbi,
      address: deployment.instantLaunchStrategy,
      startBlock,
    },
    // Every token launched by our strategy. For transfers touching the PoolManager, handlers fetch the
    // receipt and read the matching v4 Swap logs, so we never index every Swap on Base's PoolManager.
    LaunchedToken: {
      chain: "base",
      abi: uerc20Abi,
      address: factory({
        address: deployment.instantLaunchStrategy,
        event: getAbiItem({ abi: instantLaunchStrategyAbi, name: "TokenLaunched" }),
        parameter: "token",
      }),
      startBlock,
    },
    FeeSplitter: {
      chain: "base",
      abi: feeSplitterAbi,
      address: deployment.feeSplitter,
      startBlock,
    },
    BeneficiaryVault: {
      chain: "base",
      abi: beneficiaryVaultAbi,
      address: deployment.beneficiaryVault,
      startBlock,
    },
  },
});
