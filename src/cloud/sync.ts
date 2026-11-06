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
  // Nom du coach affiché sur les séances partagées.
  const coachName = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !supabase) return
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      coachName.current = ((u?.user_metadata?.name as string) || u?.email?.split('@')[0] || '').slice(0, 60) || null
    })
  }, [enabled])
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

  // Un seul envoi à la fois : un envoi plus ancien ne doit jamais arriver après un plus récent.
  const sending = useRef(false)
  const push = async (): Promise<void> => {
    if (sending.current) return
    sending.current = true
    let ok = false
    try { ok = await pushOnce() } catch { dirty.current = true; setState(navigator.onLine ? 'error' : 'offline') }
    finally { sending.current = false }
    // Modifié pendant un envoi réussi : on renvoie la dernière version tout de suite
    // (en cas d'échec, le nouvel essai se fait toutes les 10 s).
    if (ok && dirty.current && navigator.onLine && latest.current?.code) {
      clearTimeout(timer.current)
      timer.current = window.setTimeout(push, 300)
    }
  }
  const pushOnce = async (): Promise<boolean> => {
    const s = latest.current
    if (!supabase || !s?.code || !dirty.current) return true
    if (!navigator.onLine) { setState('offline'); return false }
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
      title: s.title ?? null, comment: s.comment ?? null, general: s.general ?? null, course_id: s.courseId ?? null,
      coach_name: coachName.current,
      mode: s.mode ?? null, pursuit: s.pursuit ?? null
    }
    for (const [k, v] of Object.entries(optional)) if (!missing.current.has(k)) row[k] = v
    let { error } = await supabase.from('sessions').upsert(row)
    // Repli si une migration récente (0004 titre, 0005 commentaire / chrono général) n'est pas encore passée.
    for (let i = 0; error && i < 8; i++) {
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
      return false
    }
    if (!dirty.current) setState('ok')
    return true
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
    // App mise en arrière-plan (iOS peut la fermer) : on envoie tout de suite.
    const hide = () => document.visibilityState === 'hidden' && retry()
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', hide)
    const i = setInterval(retry, 10000)
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', hide); clearInterval(i) }
  }, [enabled])

  // Athlètes inscrits par le lien (séance en cours uniquement).
  const sid = session?.id
  const active = enabled && !!session?.code && !session?.endedAt
  useEffect(() => {
    if (!active || !supabase || !sid) return
    let stop = false
    let busy = false
    const poll = async () => {
      if (!navigator.onLine || busy) return
      busy = true
      try { await pollOnce() } catch { /* réseau : nouvel essai au prochain tour */ } finally { busy = false }
    }
    const pollOnce = async () => {
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
