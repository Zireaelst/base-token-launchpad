/**
 * Token images come from on-chain metadata, which anyone can set by launching through another frontend.
 * We only render images from our own Blob store (or our dev upload route); anything else shows a blank tile.
 */
export function trustedImage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com")) return url;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (
      u.pathname.startsWith("/api/upload/") &&
      (u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        (site && u.origin === new URL(site).origin))
    ) {
      return url;
    }
  } catch {}
  return undefined;
}
