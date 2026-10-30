#!/usr/bin/env bash
# Full local stack on a Base fork: anvil + our contracts, the Ponder indexer, and the web app.
# Local only: never touches mainnet state. Used for development, Playwright e2e and screenshots.
#   bash scripts/local-stack.sh            # next dev
#   WEB_MODE=prod bash scripts/local-stack.sh   # next build && next start (Lighthouse)
# Env: FORK_PORT (8545), INDEXER_PORT (42069), WEB_PORT (3000), FORK_RPC_URL (public Base RPC by default).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORK_PORT="${FORK_PORT:-8545}"
INDEXER_PORT="${INDEXER_PORT:-42069}"
WEB_PORT="${WEB_PORT:-3000}"
DEPLOYMENT="$ROOT/packages/contracts/deployments/local.json"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

rm -f "$DEPLOYMENT"
(cd "$ROOT/packages/contracts" && PORT="$FORK_PORT" bash script/local-fork.sh) &
PIDS+=($!)
for _ in $(seq 1 120); do [ -f "$DEPLOYMENT" ] && break; sleep 1; done
[ -f "$DEPLOYMENT" ] || { echo "fork did not come up"; exit 1; }

RPC="http://127.0.0.1:${FORK_PORT}"
(cd "$ROOT/apps/indexer" && rm -rf .ponder && LAUNCHPAD_DEPLOYMENT="$DEPLOYMENT" PONDER_RPC_URL_8453="$RPC" \
  npx ponder start --schema local --port "$INDEXER_PORT") &
PIDS+=($!)
for _ in $(seq 1 120); do curl -sf "http://127.0.0.1:${INDEXER_PORT}/ready" >/dev/null && break; sleep 1; done

# Web env from the fork deployment. Test Builder Code only; production uses the real one from base.dev.
python3 -I - "$DEPLOYMENT" "$RPC" "http://127.0.0.1:${INDEXER_PORT}" "http://localhost:${WEB_PORT}" > "$ROOT/apps/web/.env.local" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(f"""NEXT_PUBLIC_BUILDER_CODE=bc_test
NEXT_PUBLIC_TOKEN_FACTORY={d['tokenFactory']}
NEXT_PUBLIC_BENEFICIARY_VAULT={d['beneficiaryVault']}
NEXT_PUBLIC_FEE_SPLITTER={d['feeSplitter']}
NEXT_PUBLIC_INSTANT_LAUNCH_STRATEGY={d['instantLaunchStrategy']}
NEXT_PUBLIC_UNIVERSAL_ROUTER_STRATEGY={d['universalRouterStrategy']}
NEXT_PUBLIC_PLATFORM_TREASURY={d['treasury']}
NEXT_PUBLIC_SITE_URL={sys.argv[4]}
BASE_RPC_URL={sys.argv[2]}
INDEXER_URL={sys.argv[3]}""")
PY

cd "$ROOT/apps/web"
if [ "${WEB_MODE:-dev}" = "prod" ]; then
  ALLOW_LOCAL_UPLOADS=1 npx next build && ALLOW_LOCAL_UPLOADS=1 npx next start -p "$WEB_PORT" &
else
  npx next dev -p "$WEB_PORT" &
fi
PIDS+=($!)
echo "local stack: web http://localhost:${WEB_PORT} · indexer :${INDEXER_PORT} · fork :${FORK_PORT}"
wait
