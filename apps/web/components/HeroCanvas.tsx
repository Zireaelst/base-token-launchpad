"use client";

import { useEffect, useRef } from "react";

/**
 * Our mascot ("Dot"), drawn every frame as horizontal scanline rows of quantised dots: luminance maps to
 * 5 dot sizes, row pitch = 2× column pitch. Slow drift, breathing scale, an occasional row-glitch, and a
 * dot-by-dot dissolve between two poses. The asset is procedural (signed distance fields below), no images.
 *
 * Performance: DPR capped at 2, paused off-screen and when the tab is hidden, a single static frame under
 * prefers-reduced-motion. Loaded lazily after the headline (see HeroVisual), so it never delays LCP.
 */

type Pose = 0 | 1;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const circle = (x: number, y: number, cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) - r;
const box = (x: number, y: number, cx: number, cy: number, hw: number, hh: number, r = 0) => {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
/** Soft fill: 1 inside, 0 outside, smooth over `w`. */
const fill = (d: number, w = 0.025) => clamp(0.5 - d / w);

/** Luminance (0..1) of the mascot at normalised coordinates, x/y in [-1, 1]. */
function mascot(x: number, y: number, pose: Pose): number {
  // Head: a rounded screen with a soft vertical gradient.
  const head = fill(box(x, y, 0, -0.12, 0.52, 0.42, 0.18));
  const shade = 0.55 + 0.35 * (1 - (y + 0.6) / 1.2);
  // Visor: darker band across the face.
  const visor = fill(box(x, y, 0, -0.14, 0.4, 0.2, 0.12));
  // Eyes: dots (pose 0) or happy arcs (pose 1).
  let eyes = 0;
  for (const ex of [-0.17, 0.17]) {
    if (pose === 0) eyes = Math.max(eyes, fill(circle(x, y, ex, -0.15, 0.07)));
    else eyes = Math.max(eyes, fill(Math.abs(circle(x, y, ex, -0.09, 0.08)) - 0.025) * (y < -0.1 ? 1 : 0));
  }
  // Antenna with a bulb that glows brighter in pose 1.
  const stem = fill(box(x, y, 0, -0.66, 0.018, 0.1));
  const bulb = fill(circle(x, y, 0, -0.8, pose === 1 ? 0.075 : 0.055));
  // Body + one arm, raised in pose 1.
  const body = fill(box(x, y, 0, 0.52, 0.34, 0.2, 0.1));
  const arm =
    pose === 0 ? fill(box(x, y, 0.45, 0.55, 0.06, 0.15, 0.05)) : fill(box(x, y, 0.5, 0.2, 0.06, 0.2, 0.05));
  const hand = pose === 1 ? fill(circle(x, y, 0.5, -0.04, 0.08)) : 0;

  let l = Math.max(
    head * shade,
    body * 0.7,
    arm * 0.75,
    hand * 0.9,
    stem * 0.8,
    bulb * (pose === 1 ? 1 : 0.85),
  );
  l = l * (1 - visor * 0.75) + visor * 0.12;
  return Math.max(l, eyes);
}

/** Stable per-dot noise in [0, 1). */
const hash = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let pitch = 6;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pitch = w < 480 ? 5 : 6;
    };
    resize();

    let glitchRow = -1;
    let glitchShift = 0;
    let glitchUntil = 0;
    let nextGlitch = 1500;
    const CYCLE = 7000; // ms per pose
    const DISSOLVE = 1400; // ms of dot-by-dot transition

    const draw = (t: number) => {
      const ink = getComputedStyle(canvas).color;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ink;

      const size = Math.min(w, h) * 0.46 * (reduced ? 1 : 1 + 0.015 * Math.sin(t / 900));
      const cxp = w / 2 + (reduced ? 0 : Math.sin(t / 5000) * w * 0.01);
      const cyp = h / 2;

      // Pose and dissolve progress.
      const phase = reduced ? 0 : t % (CYCLE * 2);
      const from: Pose = phase < CYCLE ? 0 : 1;
      const to: Pose = from === 0 ? 1 : 0;
      const local = phase % CYCLE;
      const progress = local > CYCLE - DISSOLVE ? (local - (CYCLE - DISSOLVE)) / DISSOLVE : 0;

      // Row glitch: one row shifts a few columns for a beat.
      if (!reduced && t > nextGlitch) {
        glitchRow = Math.floor(Math.random() * (h / (pitch * 2)));
        glitchShift = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
        glitchUntil = t + 140;
        nextGlitch = t + 2200 + Math.random() * 2600;
      }

      const rowPitch = pitch * 2;
      const maxR = pitch * 0.48;
      for (let j = 0, y = rowPitch / 2; y < h; j++, y += rowPitch) {
        const shift = j === glitchRow && t < glitchUntil ? glitchShift * pitch : 0;
        for (let i = 0, x = pitch / 2; x < w; i++, x += pitch) {
          const nx = (x - cxp) / size;
          const ny = (y - cyp) / size;
          if (nx < -1.1 || nx > 1.1 || ny < -1.1 || ny > 1.1) continue;
          const pose = progress > 0 && hash(i, j) < progress ? to : from;
          const level = Math.round(mascot(nx, ny, pose) * 4); // 5 dot sizes: 0..4
          if (level === 0) continue;
          ctx.beginPath();
          ctx.arc(x + shift, y, (maxR * level) / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (reduced) {
      draw(0);
      const onResize = () => {
        resize();
        draw(0);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    let visible = true;
    let start = performance.now();
    const loop = (now: number) => {
      draw(now - start);
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (raf || !visible || document.hidden) return;
      start = performance.now() - 0;
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      visible ? play() : pause();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    play();
    return () => {
      pause();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="h-full w-full text-ink" />;
}
