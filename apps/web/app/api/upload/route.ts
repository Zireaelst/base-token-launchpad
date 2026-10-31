import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/** Formats sharp actually detects from the bytes (the client-sent MIME type is not trusted). */
const DECODED = new Set(["png", "jpeg", "webp", "gif"]);

/**
 * Token image upload: max 2 MB, png/jpg/webp/gif, validated server-side by decoding the bytes, resized to
 * 512x512 WebP (animated GIFs stay animated), stored in Vercel Blob. Returns the URL and the SHA-256 of
 * the stored bytes, which the launch records on-chain in the token's metadata.
 * Without BLOB_READ_WRITE_TOKEN (local dev / e2e) files are written to .data/uploads and served by /api/upload/[id].
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "Image must be 2 MB or smaller." }, { status: 413 });
  if (!TYPES.has(file.type)) return Response.json({ error: "Use a PNG, JPG, WebP or GIF." }, { status: 415 });

  const input = Buffer.from(await file.arrayBuffer());
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, { animated: true }).metadata();
  } catch {
    return Response.json({ error: "That file is not a readable image." }, { status: 415 });
  }
  if (!meta.format || !DECODED.has(meta.format)) {
    return Response.json({ error: "Use a PNG, JPG, WebP or GIF." }, { status: 415 });
  }

  const out = await sharp(input, { animated: meta.format === "gif" })
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  const sha256 = `0x${createHash("sha256").update(out).digest("hex")}`;
  const name = `tokens/${sha256.slice(2, 18)}-${randomUUID().slice(0, 8)}.webp`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, out, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });
    return Response.json({ url: blob.url, sha256 });
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_UPLOADS) {
    return Response.json({ error: "Uploads are not configured." }, { status: 503 });
  }
  const dir = join(process.cwd(), ".data/uploads");
  await mkdir(dir, { recursive: true });
  const id = name.split("/")[1] as string;
  await writeFile(join(dir, id), out);
  return Response.json({ url: `${new URL(req.url).origin}/api/upload/${id}`, sha256 });
}
