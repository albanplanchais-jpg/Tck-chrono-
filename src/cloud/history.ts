import { useCallback, useEffect, useState } from 'preact/hooks'
import type { Athlete, Course, Session } from '../core/model'
import { loadCourses, loadHistory, saveCourses } from '../store/db'
import { supabase } from './supabase'

interface SessionRow {
  id: string; code: string; title?: string | null; comment?: string | null; general?: Session['general'] | null; course_id?: string | null; coach_id?: string; coach_name?: string | null; mode?: Session['mode'] | null; pursuit?: Session['pursuit'] | null; created_at: string; ended_at: string | null
  splits: number; athletes: Athlete[]; taps: Session['taps']
}

export const toSession = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  title: r.title ?? undefined,
  comment: r.comment ?? undefined,
  general: r.general ?? undefined,
  courseId: r.course_id ?? undefined,
  coachId: r.coach_id,
  coachName: r.coach_name ?? undefined,
  mode: r.mode ?? undefined,
  pursuit: r.pursuit ?? undefined,
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
  // Colonnes récentes en option : on retire celles qui n'existent pas encore (migrations 0004 à 0007).
  const base = 'id,code,coach_id,created_at,ended_at,splits,athletes,taps'
  let optional = ['title', 'comment', 'general', 'course_id', 'coach_name', 'mode', 'pursuit']
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  // Mes séances d'abord (jusqu'à 500), puis les plus récentes des autres coachs (150) :
  // les séances partagées ne doivent jamais pousser les miennes hors de l'historique.
  const run = (cols: string, scope: 'mine' | 'others') => {
    let q = supabase!.from('sessions').select(cols).order('created_at', { ascending: false })
    if (uid) q = scope === 'mine' ? q.eq('coach_id', uid) : q.neq('coach_id', uid)
    return q.limit(scope === 'mine' ? 500 : 150)
  }
  let data: any = null
  let error: any = null
  for (let i = 0; i < 9; i++) {
    const cols = [base, ...optional].join(',')
    const [mine, others] = await Promise.all([run(cols, 'mine'), uid ? run(cols, 'others') : Promise.resolve({ data: [], error: null })])
    error = mine.error ?? others.error
    data = error ? null : [...(mine.data ?? []), ...(others.data ?? [])]
    if (!error) break
    const bad = optional.filter((c) => error.message.includes(c))
    optional = bad.length ? optional.filter((c) => !bad.includes(c)) : optional.slice(0, -1)
  }
  if (error || !data) return { sessions: local, source: 'local' }
  const seen = new Set<string>()
  const cloud = (data as SessionRow[]).filter((r) => !seen.has(r.id) && seen.add(r.id)).map(toSession)
  // Séances terminées hors ligne et pas encore envoyées : on les garde aussi.
  const ids = new Set(cloud.map((s) => s.id))
  const merged = [...cloud, ...local.filter((s) => !ids.has(s.id))].sort((a, b) => b.createdAt - a.createdAt)
  return { sessions: merged, source: 'cloud' }
}

/** Groupe d'athlètes du coach. null si la table n'existe pas encore (migration 0004). */
export async function fetchAthletes(): Promise<Athlete[] | null> {
  if (!supabase) return null
  let { data, error } = (await supabase.from('athletes').select('id,name,bib,licence,club,categorie,embarcation').eq('archived', false).order('name')) as any
  if (error) ({ data, error } = (await supabase.from('athletes').select('id,name,bib').eq('archived', false).order('name')) as any)
  if (error) return null
  return data.map((a: any) => ({
    id: a.id, name: a.name,
    ...(typeof a.bib === 'number' ? { bib: a.bib } : {}),
    ...(a.licence ? { licence: a.licence } : {}), ...(a.club ? { club: a.club } : {}),
    ...(a.categorie ? { categorie: a.categorie } : {}), ...(a.embarcation ? { embarcation: a.embarcation } : {})
  }))
}

export async function saveAthletes(list: Athlete[]): Promise<boolean> {
  if (!supabase || !list.length) return true
  const now = new Date().toISOString()
  const rows = list.map((a) => ({
    id: a.id, name: a.name, bib: a.bib ?? null, archived: false, updated_at: now,
    licence: a.licence ?? null, club: a.club ?? null, categorie: a.categorie ?? null, embarcation: a.embarcation ?? null
  }))
  let { error } = await supabase.from('athletes').upsert(rows)
  // Repli si la migration 0007 (colonnes FFCK) n'est pas encore passée.
  if (error && /licence|club|categorie|embarcation/.test(error.message))
    ({ error } = await supabase.from('athletes').upsert(rows.map(({ licence: _l, club: _c, categorie: _g, embarcation: _e, ...r }) => r)))
  return !error
}

export async function archiveAthlete(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('athletes').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id)
  return !error
}

/** Modifie titre / commentaire d'une séance passée (en ligne + copie du téléphone). */
export async function updateSessionMeta(s: Session, patch: { title?: string; comment?: string }) {
  const { archive } = await import('../store/db')
  await archive({ ...s, ...patch })
  if (!supabase) return
  const { error } = await supabase
    .from('sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', s.id)
  if (error && /comment/.test(error.message) && patch.title !== undefined)
    await supabase.from('sessions').update({ title: patch.title }).eq('id', s.id)
}

export async function updateProfile(meta: { name?: string; discipline?: string; club?: string }) {
  if (!supabase) return
  const { error } = await supabase.auth.updateUser({ data: meta })
  if (error) throw error
}

// ───────────── Parcours ─────────────
const courseRow = (c: Course) => ({
  id: c.id, name: c.name, distance: c.distance ?? null, splits: c.splits ?? 0, notes: c.notes ?? null,
  archived: false, updated_at: new Date().toISOString()
})

/** Parcours du coach : en ligne si possible (copie gardée sur le téléphone), sinon la copie locale. */
export async function fetchCourses(): Promise<Course[]> {
  const local = await loadCourses()
  if (!supabase) return local
  // Depuis la migration 0007 les parcours de tous les coachs sont lisibles : on ne liste que les siens.
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  let q = supabase.from('courses').select('id,name,distance,splits,notes').eq('archived', false).order('name')
  if (uid) q = q.eq('coach_id', uid)
  const { data, error } = await q
  if (error) return local
  const cloud: Course[] = data.map((c: any) => ({
    id: c.id, name: c.name,
    ...(c.distance ? { distance: c.distance } : {}), ...(c.splits ? { splits: c.splits } : {}), ...(c.notes ? { notes: c.notes } : {})
  }))
  // Parcours créés hors ligne : envoyés maintenant.
  const ids = new Set(cloud.map((c) => c.id))
  const pending = local.filter((c) => !ids.has(c.id) && !c.id.startsWith('removed:'))
  if (pending.length) await supabase.from('courses').upsert(pending.map(courseRow))
  const all = [...cloud, ...pending].sort((a, b) => a.name.localeCompare(b.name))
  await saveCourses(all)
  return all
}

export async function saveCourse(c: Course, all: Course[]): Promise<Course[]> {
  const next = [...all.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name))
  await saveCourses(next)
  if (supabase) await supabase.from('courses').upsert(courseRow(c))
  return next
}

export async function removeCourse(id: string, all: Course[]): Promise<Course[]> {
  const next = all.filter((x) => x.id !== id)
  await saveCourses(next)
  if (supabase) await supabase.from('courses').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id)
  return next
}

/** Historique + groupe, rechargés à la demande. */
export function useCoachData(enabled: boolean) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [group, setGroup] = useState<Athlete[] | null>(null)
  const [source, setSource] = useState<'cloud' | 'local'>('local')
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    const [{ sessions, source }, athletes, crs] = await Promise.all([
      fetchSessions(),
      enabled ? fetchAthletes() : Promise.resolve(null),
      enabled ? fetchCourses() : loadCourses()
    ])
    setSessions(sessions)
    setSource(source)
    setGroup(athletes)
    setCourses(crs)
    setLoading(false)
  }, [enabled])

  useEffect(() => { refresh() }, [refresh])
  const upsertCourse = async (c: Course) => setCourses(await saveCourse(c, courses))
  const deleteCourse = async (id: string) => setCourses(await removeCourse(id, courses))
  return { sessions, group, source, loading, refresh, courses, upsertCourse, deleteCourse }
}
