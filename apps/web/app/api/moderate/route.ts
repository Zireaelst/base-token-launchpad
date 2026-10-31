import { blockedTerm } from "@/lib/moderation";

/** Blocklist check for a launch's text before the wallet prompt (the list is server-side config). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    symbol?: string;
    description?: string;
  } | null;
  if (!body) return Response.json({ error: "invalid" }, { status: 400 });
  const term = blockedTerm(body.name ?? "", body.symbol ?? "", body.description ?? "");
  return Response.json(
    term ? { ok: false, message: "This name or description is not allowed." } : { ok: true },
  );
}
