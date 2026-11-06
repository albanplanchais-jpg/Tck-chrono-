"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "@/components/time";

/**
 * Chrono qui tourne en direct + bouton TAP essayable.
 * L'heure est capturée au pointerdown (comme dans l'app), pas au relâché.
 */
export default function LiveChrono() {
  const t0 = useRef<number | null>(null);
  const downAt = useRef<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);

  useEffect(() => {
    t0.current = Date.now() - 47210;
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const elapsed = now !== null && t0.current !== null ? now - t0.current : 0;

  function capture() {
    if (t0.current === null) return;
    const at = downAt.current ?? Date.now();
    downAt.current = null;
    setTaps((list) => [at - (t0.current as number), ...list].slice(0, 3));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 150);
    try {
      navigator.vibrate?.(15);
    } catch {}
  }

  const inv = flash;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-ink transition-colors duration-150 ${inv ? "bg-ink text-ground" : "bg-ground text-ink"}`}
    >
      {/* barre de titre, façon fenêtre du template */}
      <div className={`flex h-12 items-center justify-between border-b px-5 ${inv ? "border-ground" : "border-line"}`}>
        <span className="flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] uppercase">
          <span className="h-2 w-2 animate-[blink_1s_steps(1)_infinite] rounded-full bg-current" />
          Séance en cours
        </span>
        <span className={`font-mono text-xs font-bold ${inv ? "text-line" : "text-muted"}`}>LIVE</span>
      </div>

      <div className="flex flex-col items-center gap-8 px-5 py-10 md:py-14">
        <div
          aria-live="off"
          className="font-mono text-[clamp(64px,13vw,168px)] leading-[0.85] font-extrabold tracking-[-0.06em] whitespace-nowrap tabular-nums"
        >
          {fmt(elapsed)}
        </div>

        {/* Fil d'événements : reprend les animations "code-1…6" du template */}
        <div className={`h-24 text-center font-mono text-sm font-bold md:text-base [&_span]:opacity-0 ${inv ? "text-line" : "text-muted"}`}>
          <span className={`animate-[code-1_10s_infinite] ${inv ? "text-ground" : "text-ink"}`}>Lucas — DÉPART</span>{" "}
          <span className="animate-[code-2_10s_infinite]">14:31:02.18</span>
          <br />
          <span className={`animate-[code-3_10s_infinite] ${inv ? "text-ground" : "text-ink"}`}>Emma — ARRIVÉE</span>{" "}
          <span className="animate-[code-4_10s_infinite]">01:01.89</span>
          <br />
          <span className={`animate-[code-5_10s_infinite] ${inv ? "text-ground" : "text-ink"}`}>Chloé — ARRIVÉE</span>{" "}
          <span className="animate-[code-6_10s_infinite]">+0:00.32</span>
        </div>

        {/* TAP */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <span aria-hidden="true" className="absolute inset-0 animate-[ripple_2.6s_cubic-bezier(.2,.8,.2,1)_infinite] rounded-full border-2 border-current" />
            <span aria-hidden="true" className="absolute inset-0 animate-[ripple_2.6s_cubic-bezier(.2,.8,.2,1)_1.3s_infinite] rounded-full border-2 border-current" />
            <button
              type="button"
              aria-label="TAP — capturer le temps"
              onPointerDown={() => {
                downAt.current = Date.now();
                setPressed(true);
              }}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onClick={capture}
              className={`relative h-36 w-36 cursor-pointer touch-manipulation rounded-full border-4 border-current text-4xl font-black transition-[transform,background-color,color] duration-[90ms] ${pressed ? "scale-[.93]" : "scale-100"} ${pressed !== inv ? "bg-ground text-ink" : "bg-ink text-ground"}`}
            >
              TAP
            </button>
          </div>
          <span className={`h-6 font-mono text-base font-bold tabular-nums ${inv ? "text-line" : "text-muted"}`}>
            {taps.length === 0
              ? "Touche TAP"
              : `Ton temps : ${fmt(taps[0])}${taps[1] !== undefined ? `   +${fmt(taps[0] - taps[1])}` : ""}`}
          </span>
        </div>
      </div>
    </div>
  );
}
