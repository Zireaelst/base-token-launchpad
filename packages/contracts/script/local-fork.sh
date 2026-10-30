#!/usr/bin/env bash
# Starts an anvil fork of Base mainnet, deploys the launchpad to it (local only, never mainnet),
# and writes the addresses to deployments/local.json. Used by SDK/indexer fork tests and e2e.
# Env: FORK_RPC_URL (default: public Base RPC), FORK_BLOCK (optional), PORT (default 8545).
# Stops anvil when this script exits; run it in the background and wait for deployments/local.json.
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_RPC_URL="${FORK_RPC_URL:-${BASE_RPC_URL:-https://mainnet.base.org}}"
PORT="${PORT:-8545}"
RPC="http://127.0.0.1:${PORT}"
# A placeholder treasury contract (local fork only; mainnet uses the Safe from PLATFORM_TREASURY).
TREASURY=0x000000000000000000000000000000000000F00D

rm -f deployments/local.json
mkdir -p deployments

ANVIL_ARGS=(--fork-url "$FORK_RPC_URL" --port "$PORT" --silent)
[ -n "${FORK_BLOCK:-}" ] && ANVIL_ARGS+=(--fork-block-number "$FORK_BLOCK")
anvil "${ANVIL_ARGS[@]}" &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
[ "$(cast chain-id --rpc-url "$RPC")" = "8453" ] || { echo "anvil fork is not Base (8453)"; exit 1; }

# Indexing starts right after the fork point: everything later is local activity.
START_BLOCK=$(( $(cast block-number --rpc-url "$RPC") + 1 ))

# Contract code so the deploy script's "treasury must be a contract" guard passes.
cast rpc anvil_setCode "$TREASURY" 0x00 --rpc-url "$RPC" >/dev/null
SENDER=$(cast rpc eth_accounts --rpc-url "$RPC" | python3 -I -c "import json,sys; print(json.load(sys.stdin)[0])")

# Deploy and wait for the broadcast to finish before publishing anything.
OUT=$(PLATFORM_TREASURY=$TREASURY forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
  --rpc-url "$RPC" --sender "$SENDER" --unlocked --broadcast --json)
rm -rf broadcast/DeployLaunchpad.s.sol/8453 cache/DeployLaunchpad.s.sol

# Write deployments/local.json only after every contract has code, so waiters never see a half deploy.
ADDRS=$(printf '%s\n' "$OUT" | python3 -I -c "
import json, sys
for line in sys.stdin:
    try: obj = json.loads(line)
    except ValueError: continue
    ret = obj.get('returns', {}).get('d', {}).get('value')
    if ret: print(ret.strip('()').replace(',', ''))
")
[ -n "$ADDRS" ] || { echo "deploy failed"; exit 1; }
for a in $ADDRS; do
  [ "$(cast codesize "$a" --rpc-url "$RPC")" -gt 0 ] || { echo "no code at $a"; exit 1; }
done
python3 -I - "$ADDRS" "$TREASURY" "$RPC" "$START_BLOCK" <<'PY'
import json, sys
addrs, treasury, rpc, start = sys.argv[1].split(), sys.argv[2], sys.argv[3], int(sys.argv[4])
keys = ["tokenFactory", "beneficiaryVault", "feeSplitter", "instantLaunchStrategy", "universalRouterStrategy"]
out = dict(zip(keys, addrs), treasury=treasury, rpcUrl=rpc, chainId=8453, startBlock=start)
tmp = "deployments/local.json.tmp"
json.dump(out, open(tmp, "w"), indent=2)
import os; os.replace(tmp, "deployments/local.json")
print("local fork ready:", json.dumps(out))
PY
wait $ANVIL_PID
