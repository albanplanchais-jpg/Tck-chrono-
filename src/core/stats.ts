import type { Athlete, Session } from './model'
import { computeAthlete, ranking } from './results'

export interface SessionSummary {
  session: Session
  athletes: number
  passages: number
  best?: { time: number; name: string }
}

export function summarize(s: Session): SessionSummary {
  const r = ranking(s)
  const passages = r.reduce((n, x) => n + x.runs.length, 0)
  const active = r.filter((x) => x.runs.length || x.openStart !== undefined).length
  const top = r[0]?.best !== undefined ? { time: r[0].best!, name: r[0].athlete.name } : undefined
  return { session: s, athletes: active || s.athletes.length, passages, best: top }
}

export interface Performance { session: Session; best?: number; runs: number[]; splits: number[][] }
export interface AthleteStats {
  athlete: Athlete
  best?: number
  sessions: number
  passages: number
  history: Performance[] // plus récente d'abord
}

/** Rattache un athlète d'une séance au groupe : même id, sinon même nom. */
export const sameAthlete = (a: Athlete, b: Athlete) =>
  a.id === b.id || (!!a.licence && a.licence === b.licence) || a.name.trim().toLowerCase() === b.name.trim().toLowerCase()

/** Statistiques de chaque athlète du groupe sur toutes les séances. */
export function athleteStats(group: Athlete[], sessions: Session[]): AthleteStats[] {
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt)
  return group
    .map((athlete) => {
      const history: Performance[] = []
      for (const s of sorted) {
        const inSession = s.athletes.find((x) => sameAthlete(x, athlete))
        if (!inSession) continue
        const r = computeAthlete(inSession, s.taps)
        if (!r.runs.length) continue
        history.push({ session: s, best: r.best, runs: r.runs.map((x) => x.time), splits: r.runs.map((x) => x.splits) })
      }
      const bests = history.map((h) => h.best!).filter((x) => x !== undefined)
      return {
        athlete,
        best: bests.length ? Math.min(...bests) : undefined,
        sessions: history.length,
        passages: history.reduce((n, h) => n + h.runs.length, 0),
        history
      }
    })
    .sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity) || a.athlete.name.localeCompare(b.athlete.name))
}

export function totals(sessions: Session[], group: Athlete[]) {
  const passages = sessions.reduce((n, s) => n + summarize(s).passages, 0)
  return { sessions: sessions.length, athletes: group.length, passages }
}

export interface CourseEntry {
  athlete: Athlete
  best: number
  session: Session
  runs: number
}

export interface CourseStats {
  sessions: Session[]
  /** Meilleur temps de chaque athlète sur le parcours, du plus rapide au plus lent. */
  board: CourseEntry[]
  record?: CourseEntry
  passages: number
}

/** Classement d'un parcours : meilleur temps de chaque athlète sur toutes les séances du parcours. */
export function courseStats(courseId: string, sessions: Session[], group: Athlete[] = []): CourseStats {
  const on = sessions.filter((s) => s.courseId === courseId).sort((a, b) => b.createdAt - a.createdAt)
  const best = new Map<string, CourseEntry>()
  let passages = 0
  for (const s of on)
    for (const a of s.athletes) {
      const r = computeAthlete(a, s.taps)
      passages += r.runs.length
      if (r.best === undefined) continue
      // Même athlète d'une séance à l'autre : même id, sinon même nom.
      const known = group.find((g) => sameAthlete(g, a)) ?? a
      const key = known.id
      const cur = best.get(key)
      const runs = (cur?.runs ?? 0) + r.runs.length
      if (!cur || r.best < cur.best) best.set(key, { athlete: known, best: r.best, session: s, runs })
      else cur.runs = runs
    }
  const board = [...best.values()].sort((a, b) => a.best - b.best)
  return { sessions: on, board, record: board[0], passages }
}

/** Meilleur temps d'un athlète sur chaque parcours. */
export function athleteCourseBests(athlete: Athlete, courses: { id: string; name: string }[], sessions: Session[]) {
  return courses
    .map((c) => {
      const st = courseStats(c.id, sessions, [athlete])
      const mine = st.board.find((e) => sameAthlete(e.athlete, athlete))
      return mine ? { course: c, best: mine.best, rank: st.board.indexOf(mine) + 1, of: st.board.length, session: mine.session } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
}
