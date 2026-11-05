import type { Athlete } from './model'

/**
 * Ordre de départ = ordre du tableau `athletes`. Des athlètes consécutifs reliés
 * par `withPrev` forment une vague : ils partent ensemble.
 */
export function waves(list: Athlete[]): Athlete[][] {
  const out: Athlete[][] = []
  list.forEach((a, i) => {
    if (i > 0 && a.withPrev && out.length) out[out.length - 1].push(a)
    else out.push([a])
  })
  return out
}

const flatten = (w: Athlete[][]) =>
  w.flatMap((g) => g.map((a, i) => (i === 0 ? { ...a, withPrev: undefined } : { ...a, withPrev: true })))

export function waveOf(list: Athlete[], id: string): Athlete[] {
  return waves(list).find((g) => g.some((a) => a.id === id)) ?? []
}

/** Numéro de vague (1, 2…) de chaque athlète. */
export function waveNumbers(list: Athlete[]): Map<string, number> {
  const m = new Map<string, number>()
  waves(list).forEach((g, i) => g.forEach((a) => m.set(a.id, i + 1)))
  return m
}

/** Monte (-1) ou descend (+1) toute la vague de l'athlète. */
export function moveWave(list: Athlete[], id: string, dir: -1 | 1): Athlete[] {
  const w = waves(list)
  const i = w.findIndex((g) => g.some((a) => a.id === id))
  const j = i + dir
  if (i < 0 || j < 0 || j >= w.length) return list
  ;[w[i], w[j]] = [w[j], w[i]]
  return flatten(w)
}

/** Déplace toute la vague de l'athlète à la position `to` (0 = premier départ). */
export function moveWaveTo(list: Athlete[], id: string, to: number): Athlete[] {
  const w = waves(list)
  const i = w.findIndex((g) => g.some((a) => a.id === id))
  if (i < 0) return list
  const j = Math.max(0, Math.min(w.length - 1, to))
  if (i === j) return list
  const [g] = w.splice(i, 1)
  w.splice(j, 0, g)
  return flatten(w)
}

/** L'athlète `id` part avec la vague de `targetId` (il est placé à la fin de cette vague). */
export function startWith(list: Athlete[], id: string, targetId: string): Athlete[] {
  if (id === targetId) return list
  const me = list.find((a) => a.id === id)
  if (!me) return list
  const w = waves(list)
    .map((g) => g.filter((a) => a.id !== id))
    .filter((g) => g.length)
  const t = w.findIndex((g) => g.some((a) => a.id === targetId))
  if (t < 0) return list
  w[t] = [...w[t], me]
  return flatten(w)
}

/** Sort l'athlète de sa vague : il part seul, juste après. */
export function startAlone(list: Athlete[], id: string): Athlete[] {
  const w = waves(list)
  const i = w.findIndex((g) => g.some((a) => a.id === id))
  if (i < 0 || w[i].length === 1) return list
  const me = w[i].find((a) => a.id === id)!
  w[i] = w[i].filter((a) => a.id !== id)
  w.splice(i + 1, 0, [me])
  return flatten(w)
}

/** Tri par dossard (sans dossard à la fin) ; les vagues sont défaites. */
export function sortByBib(list: Athlete[]): Athlete[] {
  return [...list]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.bib ?? Infinity) - (y.a.bib ?? Infinity) || x.i - y.i)
    .map(({ a }) => ({ ...a, withPrev: undefined }))
}

export const label = (a: Athlete) => (a.bib !== undefined ? `${a.bib} · ${a.name}` : a.name)

/** Dossard saisi → nombre (vide ou invalide → undefined). */
export function parseBib(v: string): number | undefined {
  const n = parseInt(v.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : undefined
}
