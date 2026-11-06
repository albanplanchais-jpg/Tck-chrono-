const p2 = (n: number) => (n < 10 ? "0" : "") + n;

/** mm:ss.cc */
export function fmt(ms: number) {
  ms = Math.max(0, ms);
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 100;
  return `${p2(m)}:${p2(s)}.${p2(cs)}`;
}

/** +m:ss.cc */
export function gap(ms: number) {
  ms = Math.max(0, ms);
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000);
  return `+${m}:${p2(s)}.${p2(cs)}`;
}
