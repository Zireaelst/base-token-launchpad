import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

/** Serves locally stored uploads (dev / e2e only; production uses Vercel Blob URLs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{16}-[0-9a-f]{8}\.webp$/.test(id)) return new Response("not found", { status: 404 });
  try {
    const bytes = await readFile(join(process.cwd(), ".data/uploads", id));
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
