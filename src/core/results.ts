import type { Athlete, Kind, Session, Tap } from './model'

export interface Run {
  start: number
  finish: number
  time: number
  /** Temps intermédiaires, en ms depuis le départ. */
  splits: number[]
}

export interface AthleteResult {
  athlete: Athlete
  runs: Run[]
  best?: number
  openStart?: number // en course depuis…
  openSplits: number[] // inters déjà pris sur le passage en cours
}

export interface Ranked extends AthleteResult {
  rank?: number
  gap?: number
}

const active = (taps: Tap[]) => taps.filter((t) => !t.voided && t.athleteId && t.kind)

/** Associe chaque départ à l'arrivée suivante (inters entre les deux), par athlète. */
export function computeAthlete(athlete: Athlete, taps: Tap[]): AthleteResult {
  const mine = active(taps)
    .filter((t) => t.athleteId === athlete.id)
    .sort((a, b) => a.t - b.t)
  const runs: Run[] = []
  let open: number | undefined
  let splits: number[] = []
  for (const tap of mine) {
    if (tap.kind === 'start') {
      open = tap.t
      splits = []
    } else if (open === undefined || tap.t < open) {
      continue // inter ou arrivée sans départ : ignoré
    } else if (tap.kind === 'split') {
      splits.push(tap.t - open)
    } else {
      runs.push({ start: open, finish: tap.t, time: tap.t - open, splits })
      open = undefined
      splits = []
    }
  }
  const best = runs.length ? Math.min(...runs.map((r) => r.time)) : undefined
  return { athlete, runs, best, openStart: open, openSplits: open === undefined ? [] : splits }
}

export function computeAll(session: Pick<Session, 'athletes' | 'taps'>): AthleteResult[] {
  return session.athletes.map((a) => computeAthlete(a, session.taps))
}

/** État de chaque athlète juste avant un tap (ce tap exclu) — sert à proposer départ / inter / arrivée. */
export function stateAt(session: Session, tap: Tap): AthleteResult[] {
  return computeAll({ athletes: session.athletes, taps: session.taps.filter((x) => x.id !== tap.id && x.t <= tap.t) })
}

/** Ce qu'un tap devrait être pour cet athlète si le coach ne force rien. */
export function autoKind(r: AthleteResult, splits = 0): Kind {
  if (r.openStart === undefined) return 'start'
  return r.openSplits.length < splits ? 'split' : 'finish'
}

/** Classement par meilleur temps ; ceux sans temps à la fin. */
export function ranking(session: Session): Ranked[] {
  const all = computeAll(session)
  // Poursuite : le classement se fait à l'ordre d'arrivée (premier qui franchit la ligne).
  if (session.mode === 'pursuit') {
    const arrived = all.filter((r) => r.runs.length).sort((a, b) => a.runs[0].finish - b.runs[0].finish)
    const first = arrived[0]?.runs[0].finish
    const ranked: Ranked[] = arrived.map((r) => ({
      ...r,
      rank: arrived.findIndex((x) => x.runs[0].finish === r.runs[0].finish) + 1,
      gap: r.runs[0].finish - first!
    }))
    return [...ranked, ...all.filter((r) => !r.runs.length)]
  }
  const timed = all.filter((r) => r.best !== undefined).sort((a, b) => a.best! - b.best!)
  const lead = timed[0]?.best
  // Ex aequo : même temps → même rang (1, 1, 3…).
  const ranked: Ranked[] = timed.map((r) => ({ ...r, rank: timed.findIndex((x) => x.best === r.best) + 1, gap: r.best! - lead! }))
  return [...ranked, ...all.filter((r) => r.best === undefined)]
}

export function pendingTaps(session: Session): Tap[] {
  return session.taps.filter((t) => !t.voided && (!t.athleteId || !t.kind)).sort((a, b) => a.t - b.t)
}

/** Numéro de l'inter (1, 2…) que représente ce tap. */
export function splitIndex(session: Session, tap: Tap): number {
  const r = stateAt(session, tap).find((x) => x.athlete.id === tap.athleteId)
  return (r?.openSplits.length ?? 0) + 1
}

export type { Kind }
