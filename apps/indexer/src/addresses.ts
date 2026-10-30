import { readFileSync } from "node:fs";
import { BASE_EXTERNAL, type LaunchpadDeployment } from "@launchpad/sdk";

/**
 * Deployment addresses come from a JSON file (LAUNCHPAD_DEPLOYMENT, e.g. packages/contracts/deployments/local.json
 * for the local fork) or from env vars once mainnet addresses exist. START_BLOCK is the deploy block.
 */
export function loadDeployment(): LaunchpadDeployment {
  const file = process.env.LAUNCHPAD_DEPLOYMENT;
  if (file) return JSON.parse(readFileSync(file, "utf8")) as LaunchpadDeployment;
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env ${k} (or set LAUNCHPAD_DEPLOYMENT)`);
    return v as `0x${string}`;
  };
  return {
    tokenFactory: need("TOKEN_FACTORY"),
    beneficiaryVault: need("BENEFICIARY_VAULT"),
    feeSplitter: need("FEE_SPLITTER"),
    instantLaunchStrategy: need("INSTANT_LAUNCH_STRATEGY"),
    universalRouterStrategy: need("UNIVERSAL_ROUTER_STRATEGY"),
  };
}

export const deployment = loadDeployment();

/** START_BLOCK env, else `startBlock` from the deployment JSON (written by local-fork.sh), else 0. */
export const startBlock = Number(
  process.env.START_BLOCK ||
    (process.env.LAUNCHPAD_DEPLOYMENT
      ? (JSON.parse(readFileSync(process.env.LAUNCHPAD_DEPLOYMENT, "utf8")) as { startBlock?: number })
          .startBlock
      : 0) ||
    0,
);
export const addresses = { ...BASE_EXTERNAL, ...deployment };
