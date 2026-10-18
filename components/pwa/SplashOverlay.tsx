"use client";

import { useEffect, useState } from "react";

/** Logo-vlak in CSS-pixels; gelijk aan LOGO_CSS in scripts/generate-splash.mjs. */
const LOGO_SIZE = 168;
/** Minimaal zichtbaar: de naam staat dan ruim een seconde volledig in beeld. */
const MIN_VISIBLE_MS = 1900;

/**
 * Opstartscherm in de app (alleen als geïnstalleerde PWA, zie .pwa-splash in globals.css).
 * Neemt het opstartbeeld van iOS naadloos over: zelfde verloop, zelfde logo op dezelfde plek.
 * Daarna verschijnt de naam en vervaagt alles naar de app.
 */
export function SplashOverlay() {
  const [phase, setPhase] = useState<"show" | "out" | "gone">("show");

  useEffect(() => {
    // Tikken slaat het opstartscherm over.
    const skip = () => setPhase((p) => (p === "show" ? "out" : p));
    window.addEventListener("pointerdown", skip, { once: true });
    const started = performance.now();
    let outTimer = 0;
    let goneTimer = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      const wait = Math.max(0, (reduced ? 200 : MIN_VISIBLE_MS) - (performance.now() - started));
      outTimer = window.setTimeout(() => {
        setPhase("out");
        goneTimer = window.setTimeout(() => setPhase("gone"), reduced ? 0 : 550);
      }, wait);
    };
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("load", finish);
      window.clearTimeout(outTimer);
      window.clearTimeout(goneTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const t = window.setTimeout(() => setPhase("gone"), 550);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div className={`pwa-splash ${phase === "out" ? "pwa-splash-out" : ""}`} aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="splash-bg" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#4f6cf7" />
            <stop offset="1" stopColor="#1e2f8f" />
          </linearGradient>
          <radialGradient id="splash-glow" cx="0.5" cy="0.42" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#splash-bg)" />
        <rect width="100" height="100" fill="url(#splash-glow)" />
      </svg>
      <svg
        className="pwa-splash-logo"
        width={LOGO_SIZE}
        height={LOGO_SIZE}
        viewBox="5 4 512 512"
        style={{ marginLeft: -LOGO_SIZE / 2, marginTop: -LOGO_SIZE / 2 }}
      >
        <g transform="rotate(-8 256 270)" opacity="0.35">
          <rect x="150" y="118" width="212" height="276" rx="26" fill="#ffffff" />
        </g>
        <path
          d="M168 108 h140 l64 64 v214 a26 26 0 0 1 -26 26 h-178 a26 26 0 0 1 -26 -26 v-252 a26 26 0 0 1 26 -26 z"
          fill="#ffffff"
        />
        <path d="M308 108 v42 a22 22 0 0 0 22 22 h42 z" fill="#c7d2fe" />
        <rect x="186" y="214" width="150" height="16" rx="8" fill="#c7d2fe" />
        <rect x="186" y="252" width="150" height="16" rx="8" fill="#c7d2fe" />
        <rect x="186" y="290" width="104" height="16" rx="8" fill="#c7d2fe" />
        <rect x="186" y="336" width="62" height="16" rx="8" fill="#2f4fd8" />
        <path d="M196 108 h52 v104 l-26 -22 l-26 22 z" fill="#f59e0b" />
      </svg>
      <div className="pwa-splash-title" style={{ top: `calc(50% + ${LOGO_SIZE / 2 - 6}px)` }}>
        <p className="text-[1.375rem] font-semibold tracking-tight">Referentie</p>
        <p className="mt-1 text-sm opacity-75">Wetenschappelijke literatuur</p>
      </div>
    </div>
  );
}
