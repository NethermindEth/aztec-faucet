"use client";

import { useEffect, useState } from "react";

/**
 * Walking character with an elevated bridge in the middle of the track.
 * The character walks on the ground, jumps up onto the bridge at 25%,
 * walks across the elevated bridge deck, jumps down at 75%, then
 * runs to the finish flag.
 *
 * Track layout:
 *   [L1] ---ground--- [jump up] ===BRIDGE=== [jump down] ---ground--- [L2] [flag]
 *   2%                25%                      75%                     90%   94%
 */

const MESSAGES: { minProgress: number; text: string }[] = [
  { minProgress: 0,    text: "Sending tx to Sepolia..." },
  { minProgress: 0.08, text: "Broadcasting to L1..." },
  { minProgress: 0.15, text: "Waiting for L1 confirmation..." },
  { minProgress: 0.25, text: "Jumping onto the bridge!" },
  { minProgress: 0.35, text: "Crossing the L1 -> L2 bridge..." },
  { minProgress: 0.50, text: "Halfway across!" },
  { minProgress: 0.65, text: "L2 sequencer picking it up..." },
  { minProgress: 0.75, text: "Landed on L2!" },
  { minProgress: 0.85, text: "Finalizing..." },
  { minProgress: 0.92, text: "So close..." },
];

function getMessage(progress: number, isReady: boolean): string {
  if (isReady) return "Fee Juice ready! Copy the claim command above.";
  for (let i = MESSAGES.length - 1; i >= 0; i--) {
    if (progress >= MESSAGES[i].minProgress) return MESSAGES[i].text;
  }
  return MESSAGES[0].text;
}

// Character is on the bridge between 25% and 75% progress
// Bridge is elevated 14px above ground
const BRIDGE_START = 0.25;
const BRIDGE_END = 0.75;
const BRIDGE_HEIGHT = 8;
// Transition zones for jump animation
const JUMP_ZONE = 0.06;

function getCharacterY(progress: number, isReady: boolean): number {
  if (isReady) return 0;
  // Smoothly jump up onto bridge
  if (progress >= BRIDGE_START - JUMP_ZONE && progress < BRIDGE_START) {
    const t = (progress - (BRIDGE_START - JUMP_ZONE)) / JUMP_ZONE;
    return -t * BRIDGE_HEIGHT;
  }
  // On the bridge
  if (progress >= BRIDGE_START && progress <= BRIDGE_END) {
    return -BRIDGE_HEIGHT;
  }
  // Smoothly jump down from bridge
  if (progress > BRIDGE_END && progress < BRIDGE_END + JUMP_ZONE) {
    const t = (progress - BRIDGE_END) / JUMP_ZONE;
    return -(1 - t) * BRIDGE_HEIGHT;
  }
  return 0;
}

export function WalkingCharacter({
  progress,
  isReady,
}: {
  progress: number;
  isReady: boolean;
}) {
  const displayPercent = 2 + Math.min(progress, 1) * 90;
  const characterY = getCharacterY(progress, isReady);

  const message = getMessage(progress, isReady);

  const [visibleMsg, setVisibleMsg] = useState(message);
  const [showBubble, setShowBubble] = useState(true);

  useEffect(() => {
    if (message !== visibleMsg) {
      setVisibleMsg(message);
      setShowBubble(true);
    }
  }, [message, visibleMsg]);

  useEffect(() => {
    if (isReady) { setShowBubble(true); return; }
    if (!showBubble) return;
    const timer = setTimeout(() => setShowBubble(false), 4000);
    return () => clearTimeout(timer);
  }, [showBubble, isReady]);

  // In the jump zone: character does a jump bob
  const isJumping =
    (progress >= BRIDGE_START - JUMP_ZONE && progress < BRIDGE_START) ||
    (progress > BRIDGE_END && progress < BRIDGE_END + JUMP_ZONE);

  const bodyClass = isReady
    ? "animate-walk-celebrate"
    : isJumping
      ? "animate-walk-jump"
      : progress > 0.85
        ? "animate-walk-run"
        : "animate-walk-bob";

  const legDuration = progress > 0.85 ? "0.2s" : "0.4s";
  const armDuration = progress > 0.85 ? "0.2s" : "0.4s";

  // Bridge position in display% coords
  const bridgeLeftPct = 2 + BRIDGE_START * 90; // ~24.5%
  const bridgeRightPct = 2 + BRIDGE_END * 90;  // ~69.5%
  const bridgeWidthPct = bridgeRightPct - bridgeLeftPct; // ~45%

  return (
    <div
      className="absolute bottom-full left-0 w-full pointer-events-none"
      style={{ height: 52 }}
    >
      {/* ---- Track ---- */}

      {/* Ground line left of bridge */}
      <div className="absolute bottom-0.5 left-[2%] opacity-15 border-b border-dashed border-accent" style={{ width: "22%" }} />

      {/* Ground line right of bridge */}
      <div className="absolute bottom-0.5 opacity-15 border-b border-dashed border-accent" style={{ left: "70%", width: "24%" }} />

      {/* L1 label */}
      <div className="absolute bottom-2 left-[3%] font-label text-[8px] uppercase tracking-widest text-accent/25 font-bold">
        L1
      </div>

      {/* L2 label */}
      <div className="absolute bottom-2 font-label text-[8px] uppercase tracking-widest text-accent/25 font-bold" style={{ left: "76%" }}>
        L2
      </div>

      {/* ---- Bridge structure (elevated) ---- */}
      <div
        className="absolute opacity-25"
        style={{
          left: `${bridgeLeftPct}%`,
          width: `${bridgeWidthPct}%`,
          bottom: 0,
          height: BRIDGE_HEIGHT + 14,
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 400 34" preserveAspectRatio="none" className="absolute bottom-0">
          {/* Left tower */}
          <rect x="0" y="0" width="4" height="34" fill="var(--accent)" />
          <rect x="-2" y="0" width="8" height="3" fill="var(--accent)" />

          {/* Right tower */}
          <rect x="396" y="0" width="4" height="34" fill="var(--accent)" />
          <rect x="394" y="0" width="8" height="3" fill="var(--accent)" />

          {/* Bridge deck (elevated platform) */}
          <rect x="0" y="18" width="400" height="3" fill="var(--accent)" />

          {/* Suspension cables from towers to deck */}
          {/* Left side cables */}
          <line x1="2" y1="2" x2="50" y2="18" stroke="var(--accent)" strokeWidth="0.5" />
          <line x1="2" y1="2" x2="100" y2="18" stroke="var(--accent)" strokeWidth="0.5" />
          <line x1="2" y1="2" x2="150" y2="18" stroke="var(--accent)" strokeWidth="0.5" />

          {/* Right side cables */}
          <line x1="398" y1="2" x2="350" y2="18" stroke="var(--accent)" strokeWidth="0.5" />
          <line x1="398" y1="2" x2="300" y2="18" stroke="var(--accent)" strokeWidth="0.5" />
          <line x1="398" y1="2" x2="250" y2="18" stroke="var(--accent)" strokeWidth="0.5" />

          {/* Vertical hangers from deck */}
          {Array.from({ length: 16 }).map((_, i) => (
            <line key={i} x1={25 + i * 23} y1="18" x2={25 + i * 23} y2="34" stroke="var(--accent)" strokeWidth="0.5" />
          ))}

          {/* Deck railing */}
          <line x1="4" y1="14" x2="396" y2="14" stroke="var(--accent)" strokeWidth="0.5" />
        </svg>

        {/* Bridge label */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 font-label text-[7px] uppercase tracking-[0.25em] text-accent/30 font-bold">
          L1 &rarr; L2 Bridge
        </div>
      </div>

      {/* Left ramp (ground up to bridge) */}
      <div className="absolute opacity-15" style={{ left: `${bridgeLeftPct - 2}%`, width: "2%", bottom: 0 }}>
        <svg width="100%" height={BRIDGE_HEIGHT + 2} viewBox="0 0 20 16" preserveAspectRatio="none" className="absolute bottom-0">
          <line x1="0" y1="16" x2="20" y2="2" stroke="var(--accent)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Right ramp (bridge down to ground) */}
      <div className="absolute opacity-15" style={{ left: `${bridgeRightPct}%`, width: "2%", bottom: 0 }}>
        <svg width="100%" height={BRIDGE_HEIGHT + 2} viewBox="0 0 20 16" preserveAspectRatio="none" className="absolute bottom-0">
          <line x1="0" y1="2" x2="20" y2="16" stroke="var(--accent)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Finish line flag */}
      <div className="absolute bottom-0" style={{ left: "94%", transform: "translateX(-50%)" }}>
        <svg width="18" height="30" viewBox="0 0 18 30" fill="none" className="opacity-30">
          <line x1="2" y1="2" x2="2" y2="30" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
          <rect x="2" y="2" width="14" height="10" className="fill-accent/20 stroke-accent" strokeWidth="0.75" />
          <rect x="2" y="2" width="7" height="5" className="fill-accent/40" />
          <rect x="9" y="7" width="7" height="5" className="fill-accent/40" />
        </svg>
      </div>

      {/* ---- Character ---- */}
      <div
        className="absolute transition-[left] duration-1000 linear"
        style={{
          left: `${displayPercent}%`,
          bottom: `${-characterY}px`,
          transform: "translateX(-50%)",
          transition: "left 1s linear, bottom 0.6s ease-in-out",
        }}
      >
        {/* Speech bubble */}
        {showBubble && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap pointer-events-auto animate-panel-state-in z-50">
            <div className="bg-accent text-[#161312] text-[9px] font-label font-bold uppercase tracking-wider px-2.5 py-1 relative">
              {message}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-accent" />
            </div>
          </div>
        )}

        {/* Character body */}
        <div className={bodyClass}>
          <svg
            width="24"
            height="28"
            viewBox="0 0 24 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-accent drop-shadow-[0_0_6px_var(--accent)]"
          >
            <circle cx="12" cy="5" r="4" fill="currentColor" />
            <line x1="12" y1="9" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {isReady ? (
              <>
                <line x1="12" y1="12" x2="5" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <animate attributeName="y2" values="7;4;7" dur="0.25s" repeatCount="6" />
                </line>
                <line x1="12" y1="12" x2="19" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <animate attributeName="y2" values="4;7;4" dur="0.25s" repeatCount="6" />
                </line>
              </>
            ) : (
              <>
                <line x1="12" y1="12" x2="6" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <animate attributeName="y2" values="15;13;15" dur={armDuration} repeatCount="indefinite" />
                </line>
                <line x1="12" y1="12" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <animate attributeName="y2" values="13;15;13" dur={armDuration} repeatCount="indefinite" />
                </line>
              </>
            )}
            <line x1="12" y1="18" x2="8" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {!isReady && (
                <animate attributeName="x2" values="8;14;8" dur={legDuration} repeatCount="indefinite" />
              )}
            </line>
            <line x1="12" y1="18" x2="16" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {!isReady && (
                <animate attributeName="x2" values="14;8;14" dur={legDuration} repeatCount="indefinite" />
              )}
            </line>
          </svg>
        </div>
      </div>
    </div>
  );
}
