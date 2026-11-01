import type { Athlete, Session, Tap } from './model'

export interface Run {
  start: number
  finish: number
  time: number
}

export interface AthleteResult {
  athlete: Athlete
  runs: Run[]
  best?: number
  openStart?: number // en course depuis…
}

export interface Ranked extends AthleteResult {
  rank?: number
  gap?: number
}

const active = (taps: Tap[]) => taps.filter((t) => !t.voided && t.athleteId && t.kind)

/** Associe chaque départ à l'arrivée suivante, par athlète. */
export function computeAthlete(athlete: Athlete, taps: Tap[]): AthleteResult {
  const mine = active(taps)
    .filter((t) => t.athleteId === athlete.id)
    .sort((a, b) => a.t - b.t)
  const runs: Run[] = []
  let open: number | undefined
  for (const tap of mine) {
    if (tap.kind === 'start') open = tap.t
    else if (open !== undefined && tap.t >= open) {
      runs.push({ start: open, finish: tap.t, time: tap.t - open })
      open = undefined
    }
  }
  const best = runs.length ? Math.min(...runs.map((r) => r.time)) : undefined
  return { athlete, runs, best, openStart: open }
}

export function computeAll(session: Session): AthleteResult[] {
  return session.athletes.map((a) => computeAthlete(a, session.taps))
}

/** Classement par meilleur temps ; ceux sans temps à la fin. */
export function ranking(session: Session): Ranked[] {
  const all = computeAll(session)
  const timed = all.filter((r) => r.best !== undefined).sort((a, b) => a.best! - b.best!)
  const lead = timed[0]?.best
  const ranked: Ranked[] = timed.map((r, i) => ({ ...r, rank: i + 1, gap: r.best! - lead! }))
  return [...ranked, ...all.filter((r) => r.best === undefined)]
}

export function pendingTaps(session: Session): Tap[] {
  return session.taps.filter((t) => !t.voided && (!t.athleteId || !t.kind)).sort((a, b) => a.t - b.t)
}
