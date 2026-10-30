"use client";

import { useEffect, useRef } from "react";

/** 4x4 Bayer matrix, normalised to [0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

/**
 * Token image through a 1-bit ordered dither, so every list row looks uniform and on-brand.
 * Draws once (no animation). If the image cannot be read (CORS, 404), falls back to an empty tile.
 */
export function DitherImage({ src, size = 40, alt }: { src: string; size?: number; alt: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const res = 32; // logical pixels per side; upscaled with crisp edges
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      ctx.drawImage(img, 0, 0, res, res);
      let data: ImageData;
      try {
        data = ctx.getImageData(0, 0, res, res);
      } catch {
        return; // tainted canvas
      }
      const ink = getComputedStyle(canvas).color;
      const px = data.data;
      ctx.clearRect(0, 0, res, res);
      ctx.fillStyle = ink;
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const i = (y * res + x) * 4;
          const lum = (0.2126 * (px[i] ?? 0) + 0.7152 * (px[i + 1] ?? 0) + 0.0722 * (px[i + 2] ?? 0)) / 255;
          const alpha = (px[i + 3] ?? 0) / 255;
          // Dark pixels become ink dots.
          if (alpha > 0.1 && 1 - lum > (BAYER[(y % 4) * 4 + (x % 4)] ?? 0.5)) ctx.fillRect(x, y, 1, 1);
        }
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt}
      width={32}
      height={32}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="shrink-0 border border-line bg-bg text-ink"
    />
  );
}
