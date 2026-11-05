import { useCallback, useEffect, useState } from 'preact/hooks'
import type { Athlete, Session } from '../core/model'
import { loadHistory } from '../store/db'
import { supabase } from './supabase'

interface SessionRow {
  id: string; code: string; title: string | null; created_at: string; ended_at: string | null
  splits: number; athletes: Athlete[]; taps: Session['taps']
}

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  title: r.title ?? undefined,
  createdAt: Date.parse(r.created_at),
  endedAt: r.ended_at ? Date.parse(r.ended_at) : undefined,
  splits: r.splits,
  athletes: r.athletes ?? [],
  taps: r.taps ?? []
})

/** Séances du coach (en ligne), sinon celles gardées sur le téléphone. */
export async function fetchSessions(): Promise<{ sessions: Session[]; source: 'cloud' | 'local' }> {
  const local = await loadHistory()
  if (!supabase) return { sessions: local, source: 'local' }
  let { data, error } = await supabase
    .from('sessions')
    .select('id,code,title,created_at,ended_at,splits,athletes,taps')
    .order('created_at', { ascending: false })
    .limit(300)
  // Repli si la migration 0004 (colonne title) n'est pas encore passée.
  if (error && /title/.test(error.message))
    ({ data, error } = (await supabase
      .from('sessions')
      .select('id,code,created_at,ended_at,splits,athletes,taps')
      .order('created_at', { ascending: false })
      .limit(300)) as any)
  if (error || !data) return { sessions: local, source: 'local' }
  const cloud = (data as SessionRow[]).map(toSession)
  // Séances terminées hors ligne et pas encore envoyées : on les garde aussi.
  const ids = new Set(cloud.map((s) => s.id))
  const merged = [...cloud, ...local.filter((s) => !ids.has(s.id))].sort((a, b) => b.createdAt - a.createdAt)
  return { sessions: merged, source: 'cloud' }
}

/** Groupe d'athlètes du coach. null si la table n'existe pas encore (migration 0004). */
export async function fetchAthletes(): Promise<Athlete[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('athletes').select('id,name,bib').eq('archived', false).order('name')
  if (error) return null
  return data.map((a: any) => ({ id: a.id, name: a.name, ...(typeof a.bib === 'number' ? { bib: a.bib } : {}) }))
}

export async function saveAthletes(list: Athlete[]): Promise<boolean> {
  if (!supabase || !list.length) return true
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('athletes')
    .upsert(list.map((a) => ({ id: a.id, name: a.name, bib: a.bib ?? null, archived: false, updated_at: now })))
  return !error
}

export async function archiveAthlete(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('athletes').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id)
  return !error
}

export async function updateProfile(meta: { name?: string; discipline?: string; club?: string }) {
  if (!supabase) return
  const { error } = await supabase.auth.updateUser({ data: meta })
  if (error) throw error
}

/** Historique + groupe, rechargés à la demande. */
export function useCoachData(enabled: boolean) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [group, setGroup] = useState<Athlete[] | null>(null)
  const [source, setSource] = useState<'cloud' | 'local'>('local')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [{ sessions, source }, athletes] = await Promise.all([fetchSessions(), enabled ? fetchAthletes() : Promise.resolve(null)])
    setSessions(sessions)
    setSource(source)
    setGroup(athletes)
    setLoading(false)
  }, [enabled])

  useEffect(() => { refresh() }, [refresh])
  return { sessions, group, source, loading, refresh }
}
