"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const COLORS_DEVNET  = ["#D4FF28", "#e8ff80", "#ffffff", "#c0ff50", "#a8e820", "#f5f5f5", "#ffeb3b"];
const COLORS_TESTNET = ["#A78BFA", "#c4b5fd", "#ffffff", "#7c3aed", "#ddd6fe", "#f5f5f5", "#e9d5ff"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  w: number;
  h: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
};

function makeBurst(ox: number, oy: number, angleMinDeg: number, angleMaxDeg: number, count: number, colors: string[]): Particle[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  return Array.from({ length: count }, () => {
    const angle = toRad(angleMinDeg + Math.random() * (angleMaxDeg - angleMinDeg));
    const speed = 10 + Math.random() * 18;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 7 + Math.random() * 8,
      h: 3 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      life: 1.0,
    };
  });
}

function ConfettiCanvas({ network }: { network?: string }) {
  const colors = network === "testnet" ? COLORS_TESTNET : COLORS_DEVNET;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use actual rendered dimensions (canvas is fixed inset-0 at body level)
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    // Left cannon at top-left corner, fan angles: -60° to +50° (right + upward arc)
    // Right cannon at top-right corner, fan angles: 130° to 240° (left + upward arc)
    const particles: Particle[] = [
      ...makeBurst(W * 0.03, H * 0.05, -60, 50, 120, colors),
      ...makeBurst(W * 0.97, H * 0.05, 130, 240, 120, colors),
    ];

    let rafId: number;

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let anyAlive = false;

      for (const p of particles) {
        p.vy += 0.22;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.life -= 0.006;

        if (p.life <= 0) continue;
        anyAlive = true;

        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 3.5);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (anyAlive) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    />
  );
}

export function ConfettiBurst({ network }: { network?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Portal to document.body so no transformed ancestor can cage the fixed canvas
  return createPortal(<ConfettiCanvas network={network} />, document.body);
}
