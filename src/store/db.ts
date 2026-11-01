import { get, set } from 'idb-keyval'
import type { Athlete, Session } from '../core/model'

const K = { session: 'session', roster: 'roster', history: 'history' }

export const loadSession = () => get<Session>(K.session)
export const saveSession = (s: Session | undefined) => set(K.session, s)

export const loadRoster = async () => (await get<Athlete[]>(K.roster)) ?? []
export const saveRoster = (r: Athlete[]) => set(K.roster, r)

export const loadHistory = async () => (await get<Session[]>(K.history)) ?? []
export async function archive(s: Session) {
  const h = await loadHistory()
  await set(K.history, [s, ...h.filter((x) => x.id !== s.id)].slice(0, 100))
}

/** Demande au navigateur de ne pas effacer nos données. */
export function requestPersist() {
  navigator.storage?.persist?.().catch(() => {})
}
