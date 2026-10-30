import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import baseConfig from "../../contracts/config/base.json" with { type: "json" };

/** Uniswap / Permit2 contracts we use but did not deploy. Single source: packages/contracts/config/base.json. */
export type ExternalAddresses = {
  liquidityLauncher: Address;
  poolManager: Address;
  positionManager: Address;
  permit2: Address;
  universalRouter: Address;
  v4Quoter: Address;
  stateView: Address;
};

/** Contracts our deploy script creates (see docs/deployment.md). */
export type LaunchpadDeployment = {
  tokenFactory: Address;
  beneficiaryVault: Address;
  feeSplitter: Address;
  instantLaunchStrategy: Address;
  universalRouterStrategy: Address;
};

export type LaunchpadContext = {
  chainId: 8453;
  external: ExternalAddresses;
  deployment: LaunchpadDeployment;
};

export const BASE_CHAIN_ID = 8453 as const;

export const BASE_EXTERNAL: ExternalAddresses = {
  liquidityLauncher: getAddress(baseConfig.liquidityLauncher),
  poolManager: getAddress(baseConfig.poolManager),
  positionManager: getAddress(baseConfig.positionManager),
  permit2: getAddress(baseConfig.permit2),
  universalRouter: getAddress(baseConfig.universalRouter),
  v4Quoter: getAddress(baseConfig.v4Quoter),
  stateView: getAddress(baseConfig.stateView),
};

export const UERC20_FACTORY_CANONICAL = getAddress(baseConfig.uerc20FactoryCanonical);

export function createContext(deployment: LaunchpadDeployment): LaunchpadContext {
  if (getAddress(deployment.tokenFactory) !== UERC20_FACTORY_CANONICAL) {
    throw new Error("tokenFactory must be the canonical UERC20Factory");
  }
  return {
    chainId: BASE_CHAIN_ID,
    external: BASE_EXTERNAL,
    deployment: {
      tokenFactory: getAddress(deployment.tokenFactory),
      beneficiaryVault: getAddress(deployment.beneficiaryVault),
      feeSplitter: getAddress(deployment.feeSplitter),
      instantLaunchStrategy: getAddress(deployment.instantLaunchStrategy),
      universalRouterStrategy: getAddress(deployment.universalRouterStrategy),
    },
  };
}

export type { Hex };
