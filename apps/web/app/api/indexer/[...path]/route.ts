/** Browser-side reads of the indexer API, so INDEXER_URL can stay private. GET only. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const base = process.env.INDEXER_URL;
  if (!base) return Response.json({ error: "indexer not configured" }, { status: 503 });
  const { path } = await params;
  if (path.some((p) => p === ".." || p.includes("/")))
    return Response.json({ error: "bad path" }, { status: 400 });
  const search = new URL(req.url).search;
  try {
    const res = await fetch(`${base}/${path.map(encodeURIComponent).join("/")}${search}`, {
      cache: "no-store",
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=2" },
    });
  } catch {
    return Response.json({ error: "indexer unavailable" }, { status: 502 });
  }
}
