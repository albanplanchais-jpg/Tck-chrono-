import { useEffect, useRef, useState } from 'preact/hooks'
import type { Athlete, Session, Tap } from '../core/model'
import { syncClock } from './clock'
import { saveAthletes } from './history'
import { supabase } from './supabase'

export type SyncState = 'off' | 'ok' | 'pending' | 'offline' | 'error'

/**
 * Envoie la séance du coach vers Supabase (après chaque modification, regroupé)
 * et récupère les athlètes qui ont rejoint par le lien. L'app reste 100 % utilisable
 * hors ligne : tout est renvoyé dès que le réseau revient.
 */
export interface CloudHandlers {
  onJoined: (a: Athlete[]) => void
  onRemoteTaps: (taps: (Tap & { updatedAt: string })[]) => void
}

export function useCloudSync(session: Session | undefined, enabled: boolean, handlers: CloudHandlers): SyncState {
  const [state, setState] = useState<SyncState>('off')
  const latest = useRef(session)
  const dirty = useRef(false)
  const missing = useRef(new Set<string>())
  const athletesKey = useRef('')
  const timer = useRef<number | undefined>(undefined)
  latest.current = session
  const cb = useRef(handlers)
  cb.current = handlers

  // Horloge commune : mesurée à l'ouverture et au retour du réseau.
  useEffect(() => {
    if (!enabled) return
    syncClock()
    const on = () => syncClock()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [enabled])

  const push = async () => {
    const s = latest.current
    if (!supabase || !s?.code || !dirty.current) return
    if (!navigator.onLine) return setState('offline')
    dirty.current = false
    const row: Record<string, unknown> = {
      id: s.id,
      code: s.code,
      created_at: new Date(s.createdAt).toISOString(),
      ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
      splits: s.splits ?? 0,
      athletes: s.athletes,
      taps: s.taps,
      updated_at: new Date().toISOString()
    }
    const optional: Record<string, unknown> = {
      title: s.title ?? null, comment: s.comment ?? null, general: s.general ?? null, course_id: s.courseId ?? null
    }
    for (const [k, v] of Object.entries(optional)) if (!missing.current.has(k)) row[k] = v
    let { error } = await supabase.from('sessions').upsert(row)
    // Repli si une migration récente (0004 titre, 0005 commentaire / chrono général) n'est pas encore passée.
    for (let i = 0; error && i < 4; i++) {
      const col = Object.keys(optional).find((k) => k in row && error!.message.includes(k))
      if (!col) break
      missing.current.add(col)
      delete row[col]
      ;({ error } = await supabase.from('sessions').upsert(row))
    }
    // Les athlètes de la séance rejoignent le groupe du coach (table athletes).
    const key = JSON.stringify(s.athletes.map((a) => [a.id, a.name, a.bib]))
    if (!error && key !== athletesKey.current && (await saveAthletes(s.athletes))) athletesKey.current = key
    if (error) {
      dirty.current = true
      setState(navigator.onLine ? 'error' : 'offline')
    } else if (!dirty.current) setState('ok')
  }

  // Chaque modification → envoi groupé 500 ms plus tard.
  useEffect(() => {
    if (!enabled || !session?.code) return setState('off')
    dirty.current = true
    setState(navigator.onLine ? 'pending' : 'offline')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(push, 500)
  }, [session, enabled])

  // Nouvel essai quand le réseau revient, et toutes les 10 s en cas d'échec.
  useEffect(() => {
    if (!enabled) return
    const retry = () => dirty.current && push()
    window.addEventListener('online', retry)
    const i = setInterval(retry, 10000)
    return () => { window.removeEventListener('online', retry); clearInterval(i) }
  }, [enabled])

  // Athlètes inscrits par le lien (séance en cours uniquement).
  const sid = session?.id
  const active = enabled && !!session?.code && !session?.endedAt
  useEffect(() => {
    if (!active || !supabase || !sid) return
    let stop = false
    const poll = async () => {
      if (!navigator.onLine) return
      // Repli si la migration 0003 (colonne bib) n'est pas encore passée.
      let { data, error } = await supabase!.from('session_joins').select('id,name,bib').eq('session_id', sid).order('created_at')
      if (error) ({ data } = await supabase!.from('session_joins').select('id,name').eq('session_id', sid).order('created_at') as any)
      if (!stop && data?.length) cb.current.onJoined(
          data.map((j) => ({ id: j.id as string, name: j.name as string, ...(typeof j.bib === 'number' ? { bib: j.bib } : {}) }))
        )
      const { data: remote } = await supabase!
        .from('remote_taps')
        .select('id,t,athlete_id,kind,voided,updated_at,session_timers(name)')
        .eq('session_id', sid)
      if (!stop && remote?.length)
        cb.current.onRemoteTaps(
          remote.map((r: any) => ({
            id: r.id,
            t: r.t,
            athleteId: r.athlete_id,
            kind: r.kind,
            voided: r.voided || undefined,
            by: r.session_timers?.name || 'Chronométreur',
            updatedAt: r.updated_at
          }))
        )
    }
    poll()
    const i = setInterval(poll, 2000)
    return () => { stop = true; clearInterval(i) }
  }, [active, sid])

  return state
}
