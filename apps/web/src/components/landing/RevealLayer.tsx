"use client";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../lib/motion/gsap";

const RADIUS = 260;

/** A soft round mask, drawn once: full in the middle, fading to nothing at the edge. */
function spotlightMask(): string | null {
  const size = RADIUS * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(RADIUS, RADIUS, 0, RADIUS, RADIUS, RADIUS);
  for (const [stop, alpha] of [
    [0, 1],
    [0.4, 1],
    [0.6, 0.75],
    [0.75, 0.4],
    [0.88, 0.12],
    [1, 0],
  ] as const) {
    gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return `url(${canvas.toDataURL()})`;
}

/**
 * A second image over the first, seen only through a soft spotlight that follows the cursor
 * with a little lag. It starts off screen, so nothing shows until the pointer moves; on a touch
 * screen or with reduced motion it stays hidden.
 */
export function RevealLayer({ image }: { image: string }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    if (!el || prefersReducedMotion()) return;
    const mask = spotlightMask();
    if (!mask) return;
    el.style.setProperty("mask-image", mask);
    el.style.setProperty("-webkit-mask-image", mask);
    el.style.setProperty("mask-repeat", "no-repeat");
    el.style.setProperty("-webkit-mask-repeat", "no-repeat");

    const mouse = { x: -RADIUS * 4, y: -RADIUS * 4 };
    const smooth = { ...mouse };
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const tick = () => {
      smooth.x += (mouse.x - smooth.x) * 0.1;
      smooth.y += (mouse.y - smooth.y) * 0.1;
      const position = `${smooth.x - RADIUS}px ${smooth.y - RADIUS}px`;
      el.style.setProperty("mask-position", position);
      el.style.setProperty("-webkit-mask-position", position);
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="absolute inset-0 bg-cover bg-center [mask-position:-9999px_-9999px]"
      style={{ backgroundImage: `url(${image})` }}
    />
  );
}
