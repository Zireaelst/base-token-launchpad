/**
 * CDP Paymaster proxy for sponsoring a creator's first launch from a smart wallet. Off unless
 * NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH=true and CDP_PAYMASTER_URL (server secret) is set.
 * Only sponsors calls to our LiquidityLauncher (enforce the same allowlist in the CDP policy).
 */
export async function POST(req: Request) {
  const upstream = process.env.CDP_PAYMASTER_URL;
  if (process.env.NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH !== "true" || !upstream) {
    return Response.json({ error: "sponsorship disabled" }, { status: 404 });
  }
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
    cache: "no-store",
  });
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } });
}
