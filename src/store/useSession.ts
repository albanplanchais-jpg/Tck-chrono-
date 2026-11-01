import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { uid, type Athlete, type Kind, type Session, type Tap } from '../core/model'
import { archive, loadRoster, loadSession, saveRoster, saveSession } from './db'

export function useSessionStore() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | undefined>()
  const [roster, setRoster] = useState<Athlete[]>([])
  const loaded = useRef(false)

  useEffect(() => {
    Promise.all([loadSession(), loadRoster()]).then(([s, r]) => {
      setSession(s)
      setRoster(r)
      loaded.current = true
      setReady(true)
    })
  }, [])

  // Sauvegarde après chaque modification (chaque tap).
  useEffect(() => {
    if (loaded.current) saveSession(session)
  }, [session])

  const patchTaps = useCallback((fn: (taps: Tap[]) => Tap[]) => {
    setSession((s) => (s ? { ...s, taps: fn(s.taps) } : s))
  }, [])

  const start = useCallback(
    (athletes: Athlete[]) => {
      const byName = new Map(roster.map((a) => [a.name.toLowerCase(), a]))
      athletes.forEach((a) => byName.set(a.name.toLowerCase(), a))
      const next = [...athletes, ...roster.filter((a) => !athletes.some((x) => x.name.toLowerCase() === a.name.toLowerCase()))].slice(0, 60)
      setRoster(next)
      saveRoster(next)
      setSession({ id: uid(), createdAt: Date.now(), athletes, taps: [] })
    },
    [roster]
  )

  const addTap = useCallback(
    (t: number) => {
      const id = uid()
      patchTaps((taps) => [...taps, { id, t }])
      return id
    },
    [patchTaps]
  )

  const assign = useCallback(
    (id: string, athleteId: string, kind: Kind) =>
      patchTaps((taps) => taps.map((x) => (x.id === id ? { ...x, athleteId, kind, voided: false } : x))),
    [patchTaps]
  )

  /** Départ groupé : le même instant devient un départ pour chaque athlète donné. */
  const massStart = useCallback(
    (id: string, athleteIds: string[]) =>
      patchTaps((taps) => {
        const src = taps.find((x) => x.id === id)
        if (!src || !athleteIds.length) return taps
        const [first, ...rest] = athleteIds
        return [
          ...taps.map((x) => (x.id === id ? { ...x, athleteId: first, kind: 'start' as Kind } : x)),
          ...rest.map((a) => ({ id: uid(), t: src.t, athleteId: a, kind: 'start' as Kind }))
        ]
      }),
    [patchTaps]
  )

  const restore = useCallback((prev: Tap[]) => patchTaps(() => prev), [patchTaps])
  const voidTap = useCallback((id: string) => patchTaps((taps) => taps.map((x) => (x.id === id ? { ...x, voided: true } : x))), [patchTaps])

  const end = useCallback(() => {
    setSession((s) => {
      if (!s) return s
      const done = { ...s, endedAt: Date.now() }
      archive(done)
      return done
    })
  }, [])
  const resume = useCallback(() => setSession((s) => (s ? { ...s, endedAt: undefined } : s)), [])
  const [lastGroup, setLastGroup] = useState<Athlete[]>([])
  const reset = useCallback(() => {
    if (session) setLastGroup(session.athletes)
    setSession(undefined)
  }, [session])

  return { ready, session, roster, lastGroup, start, addTap, assign, massStart, restore, voidTap, end, resume, reset }
}

export type Store = ReturnType<typeof useSessionStore>
