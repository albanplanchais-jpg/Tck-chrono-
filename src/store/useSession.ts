import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { uid, type Athlete, type Kind, type Session, type Tap } from '../core/model'
import { get, set } from 'idb-keyval'
import { archive, loadRoster, loadSession, saveRoster, saveSession } from './db'

export function useSessionStore() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | undefined>()
  const [roster, setRoster] = useState<Athlete[]>([])
  const [lastSplits, setLastSplits] = useState(0)
  const loaded = useRef(false)

  useEffect(() => {
    Promise.all([loadSession(), loadRoster(), get<number>('splits')]).then(([s, r, sp]) => {
      setSession(s)
      setRoster(r)
      setLastSplits(sp ?? 0)
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
    (athletes: Athlete[], splits = 0) => {
      setLastSplits(splits)
      set('splits', splits)
      const byName = new Map(roster.map((a) => [a.name.toLowerCase(), a]))
      athletes.forEach((a) => byName.set(a.name.toLowerCase(), a))
      const next = [...athletes, ...roster.filter((a) => !athletes.some((x) => x.name.toLowerCase() === a.name.toLowerCase()))].slice(0, 60)
      setRoster(next)
      saveRoster(next)
      setSession({ id: uid(), createdAt: Date.now(), athletes, taps: [], splits })
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

  /**
   * Attribue un tap à un ou plusieurs athlètes (départ / arrivée groupés) :
   * le premier garde le tap, les autres reçoivent un tap au même instant.
   */
  const assignMany = useCallback(
    (id: string, items: { athleteId: string; kind: Kind }[]) =>
      patchTaps((taps) => {
        const src = taps.find((x) => x.id === id)
        if (!src || !items.length) return taps
        const [first, ...rest] = items
        return [
          ...taps.map((x) => (x.id === id ? { ...x, ...first, voided: false } : x)),
          ...rest.map((it) => ({ id: uid(), t: src.t, ...it }))
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

  return { ready, session, roster, lastGroup, lastSplits, start, addTap, assignMany, restore, voidTap, end, resume, reset }
}

export type Store = ReturnType<typeof useSessionStore>
