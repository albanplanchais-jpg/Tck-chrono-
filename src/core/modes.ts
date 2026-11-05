import type { Athlete, Session } from './model'
import { ranking } from './results'

export interface PursuitEntry { athlete: Athlete; ref: number; offset: number }

/**
 * Poursuite (départ « handicap ») à partir des résultats d'une séance :
 * le plus lent part en premier (décalage 0), puis chacun part avec un décalage égal
 * à son avance sur le plus lent. En théorie, tout le monde arrive ensemble ;
 * le premier à franchir la ligne gagne.
 */
export function pursuitPlan(source: Session): { entries: PursuitEntry[]; without: Athlete[] } {
  const r = ranking({ ...source, mode: 'classic' })
  const timed = r.filter((x) => x.best !== undefined)
  const slowest = Math.max(...timed.map((x) => x.best!))
  const entries = timed
    .map((x) => ({ athlete: x.athlete, ref: x.best!, offset: slowest - x.best! }))
    .sort((a, b) => a.offset - b.offset || a.athlete.name.localeCompare(b.athlete.name))
  return { entries, without: r.filter((x) => x.best === undefined).map((x) => x.athlete) }
}

/** Décalage lisible : 0 → « 0:00.0 », 12 340 → « +0:12.3 », 75 000 → « +1:15.0 ». */
export function fmtOffset(ms: number) {
  const t = Math.max(0, ms)
  const m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60, d = Math.floor(t / 100) % 10
  return `${t ? '+' : ''}${m}:${String(s).padStart(2, '0')}.${d}`
}

/** Départs programmés (heure commune) une fois le top départ donné. */
export function schedule(session: Session, t0: number) {
  if (session.mode === 'mass') return session.athletes.map((a) => ({ athleteId: a.id, t: t0 }))
  if (session.mode === 'pursuit' && session.pursuit)
    return session.athletes
      .filter((a) => session.pursuit!.offsets[a.id] !== undefined)
      .map((a) => ({ athleteId: a.id, t: t0 + session.pursuit!.offsets[a.id] }))
      .sort((a, b) => a.t - b.t)
  return []
}
