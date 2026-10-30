import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { isAddress } from "viem";

export const runtime = "nodejs";

const REASONS = new Set(["scam", "impersonation", "offensive", "other"]);

/** Report a token. Stored as a private JSON object in Blob for manual review; reviewers update HIDDEN_TOKENS. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    reason?: string;
    note?: string;
  } | null;
  if (!body?.token || !isAddress(body.token) || !body.reason || !REASONS.has(body.reason)) {
    return Response.json({ error: "invalid report" }, { status: 400 });
  }
  const report = {
    token: body.token,
    reason: body.reason,
    note: (body.note ?? "").slice(0, 500),
    at: new Date().toISOString(),
  };
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.info("[report]", JSON.stringify(report));
    return Response.json({ ok: true });
  }
  await put(`reports/${report.at.slice(0, 10)}/${randomUUID()}.json`, JSON.stringify(report), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return Response.json({ ok: true });
}
