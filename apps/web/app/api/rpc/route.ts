/**
 * Read-only JSON-RPC proxy so the provider key in BASE_RPC_URL never reaches the browser.
 * Wallets broadcast through their own RPC; this proxy only serves reads, estimates and receipts.
 */
const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_simulateV1",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "eth_getLogs",
]);

type RpcRequest = { jsonrpc: "2.0"; id: number | string | null; method: string; params?: unknown };

export async function POST(req: Request) {
  const upstream = process.env.BASE_RPC_URL;
  if (!upstream) return Response.json({ error: "rpc not configured" }, { status: 503 });

  let body: RpcRequest | RpcRequest[];
  try {
    body = (await req.json()) as RpcRequest | RpcRequest[];
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 20) return Response.json({ error: "batch too large" }, { status: 413 });
  const denied = calls.find((c) => !ALLOWED.has(c.method));
  if (denied) {
    return Response.json({
      jsonrpc: "2.0",
      id: denied.id,
      error: { code: -32601, message: "method not allowed" },
    });
  }

  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } });
}
