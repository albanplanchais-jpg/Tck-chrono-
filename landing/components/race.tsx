"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, gap } from "@/components/time";

// Couloirs (ordre de départ) et temps d'arrivée en ms — exemple.
const LANES: [string, number][] = [
  ["Lucas", 62370],
  ["Emma", 61890],
  ["Hugo", 64870],
  ["Léa", 62980],
  ["Nathan", 66400],
  ["Chloé", 62210],
];
const SORTED = [...LANES].sort((a, b) => a[1] - b[1]);
const LEAD = SORTED[0][1];
const LAST = SORTED[SORTED.length - 1][1];
const CYCLE = 11000; // 7 s de course accélérée ×10, puis 4 s de classement
const SPEED = 10;

export default function Race() {
  const r0 = useRef<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    r0.current = Date.now();
    const id = window.setInterval(() => setNow(Date.now()), 40);
    return () => window.clearInterval(id);
  }, []);

  const sim = now !== null && r0.current !== null ? Math.min(((now - r0.current) % CYCLE) * SPEED, 70000) : 0;

  return (
    <section id="course" className="border-t border-line">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="py-16 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6 pb-10" data-aos="zoom-y-out">
            <div>
              <span className="text-xs font-bold tracking-[0.16em] text-muted uppercase">La course · accélérée ×10</span>
              <h2 className="mt-3 text-5xl leading-[0.95] font-black tracking-[-0.03em] md:text-6xl">
                Six bateaux.
                <br />
                Un seul écran.
              </h2>
            </div>
            <span className="font-mono text-5xl font-extrabold tracking-[-0.04em] tabular-nums md:text-6xl">
              {fmt(Math.min(sim, LAST))}
            </span>
          </div>

          <div className="border-t-2 border-ink" data-aos="zoom-y-out" data-aos-delay={150}>
            {LANES.map((lane) => {
              const [name, fin] = lane;
              const done = sim >= fin;
              const rank = SORTED.indexOf(lane) + 1;
              const first = done && rank === 1;
              const pct = Math.min(1, sim / fin) * 100;
              return (
                <div
                  key={name}
                  className={`grid min-h-16 grid-cols-[36px_minmax(56px,110px)_minmax(0,1fr)_minmax(104px,auto)] items-center gap-x-4 border-b border-line px-3 transition-colors duration-200 ${first ? "bg-ink text-ground" : "bg-ground text-ink"}`}
                >
                  <span className="font-mono text-xl font-extrabold">{done ? rank : ""}</span>
                  <span className="truncate text-lg font-extrabold">{name}</span>
                  <span className={`relative h-1 ${first ? "bg-muted" : "bg-line"}`}>
                    <span
                      className={`absolute inset-y-0 left-0 ${first ? "bg-ground" : done ? "bg-ink" : "bg-muted"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="flex flex-col items-end font-mono tabular-nums">
                    <span className="text-xl font-extrabold tracking-[-0.02em]">{fmt(Math.min(sim, fin))}</span>
                    <span className={`text-xs font-bold ${first ? "text-line" : "text-muted"}`}>
                      {done ? (rank === 1 ? "EN TÊTE" : gap(fin - LEAD)) : "EN COURSE"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
