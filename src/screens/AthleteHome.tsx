import { useEffect, useMemo, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import type { Athlete, Course, Session } from '../core/model'
import { athleteCourseBests, sameAthlete } from '../core/stats'
import { computeAthlete, ranking } from '../core/results'
import { fmtDay, fmtDuration } from '../core/format'
import { frError, supabase } from '../cloud/supabase'
import { signOut } from '../cloud/auth'
import { toSession } from '../cloud/history'
import { Results } from './Results'
import { Icon } from '../components/Icon'

interface Profile { name: string | null; licence: string | null; club: string | null }

const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']

/** Espace athlète : ses résultats sur toutes les séances où il apparaît, et le lien avec sa licence. */
export function AthleteHome({ user }: { user: User }) {
  const [tab, setTab] = useState<'results' | 'profile'>('results')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [viewing, setViewing] = useState<Session | null>(null)

  const load = async () => {
    if (!supabase) return
    setState('loading')
    // Profil athlète (créé au premier passage).
    await supabase.from('profiles').upsert({ user_id: user.id, role: 'athlete', name: (user.user_metadata?.name as string) || null }, { ignoreDuplicates: true })
    const { data: p } = await supabase.from('profiles').select('name,licence,club').eq('user_id', user.id).maybeSingle()
    setProfile((p as Profile) ?? { name: (user.user_metadata?.name as string) || null, licence: null, club: null })
    const { data, error } = await supabase.rpc('my_sessions')
    if (error) return setState('error')
    const list = (data as any[]).map(toSession)
    setSessions(list)
    const ids = [...new Set(list.map((s) => s.courseId).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: cs } = await supabase.from('courses').select('id,name,distance,splits').in('id', ids)
      setCourses((cs as Course[]) ?? [])
    }
    setState('ok')
  }
  useEffect(() => { load() }, [])

  const me: Athlete = { id: '—', name: profile?.name ?? '', ...(profile?.licence ? { licence: profile.licence } : {}) }
  const isMe = (a: Athlete) => !!profile && sameAthlete(a, me)

  const rows = useMemo(
    () =>
      sessions.map((s) => {
        const a = s.athletes.find(isMe)
        const r = a ? computeAthlete(a, s.taps) : undefined
        const rk = a ? ranking(s).find((x) => x.athlete.id === a.id) : undefined
        return { s, best: r?.best, runs: r?.runs.length ?? 0, rank: rk?.rank, of: ranking(s).filter((x) => x.rank).length }
      }),
    [sessions, profile]
  )
  const best = rows.map((r) => r.best).filter((x): x is number => x !== undefined)
  const records = useMemo(() => (profile ? athleteCourseBests(me, courses, sessions) : []), [courses, sessions, profile])

  if (viewing)
    return (
      <div class="shell">
        <Results session={viewing} onBack={() => setViewing(null)} highlight={isMe} />
      </div>
    )

  return (
    <div class="shell">
      {tab === 'results' ? (
        <div class="screen tabbed">
          <div class="scroll px">
            <header class="page-head">
              <div>
                <span class="label">Mes résultats{profile?.licence ? ` · licence ${profile.licence}` : ''}</span>
                <h1>{profile?.name || 'Athlète'}</h1>
              </div>
              <button class="icon-btn" onClick={load} aria-label="Actualiser"><Icon name="undo" size={18} /></button>
            </header>
            {!profile?.licence && (
              <button class="note-btn" onClick={() => setTab('profile')}>
                Relie ton compte à ta licence FFCK pour retrouver tous tes chronos, même si ton nom est écrit autrement. <b>Relier →</b>
              </button>
            )}
            <div class="statbox tfirst">
              <div><b class="mono">{best.length ? fmtDuration(Math.min(...best)) : '—'}</b><span>Meilleur</span></div>
              <div><b class="mono">{rows.filter((r) => r.runs).length}</b><span>Séances</span></div>
              <div><b class="mono">{rows.reduce((n, r) => n + r.runs, 0)}</b><span>Passages</span></div>
            </div>

            {records.length > 0 && (
              <>
                <div class="sec-head"><h2>Mes records par parcours</h2></div>
                <ul class="perf">
                  {records.map((b) => (
                    <li key={b.course.id}>
                      <button onClick={() => setViewing(b.session)}>
                        <span class="p-main">
                          <b><Icon name="flag" size={14} stroke={2.4} />&nbsp;{b.course.name}</b>
                          <small>{fmtDay(b.session.createdAt)}</small>
                        </span>
                        <span class="mono g-time">{fmtDuration(b.best)}</span>
                        <Icon name="right" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div class="sec-head"><h2>Mes séances</h2></div>
            {state === 'loading' && <p class="muted">Chargement…</p>}
            {state === 'error' && <p class="form-msg err">Impossible de charger tes résultats (connexion, ou base pas encore à jour).</p>}
            {state === 'ok' && !rows.length && (
              <p class="muted">Aucune séance pour l'instant. Tes chronos apparaîtront ici dès qu'un coach t'aura chronométré.</p>
            )}
            <ul class="sess-list">
              {rows.map(({ s, best, runs, rank, of }) => {
                const d = new Date(s.createdAt)
                return (
                  <li key={s.id}>
                    <button class="sess" onClick={() => setViewing(s)}>
                      <span class="datebox"><b class="mono">{String(d.getDate()).padStart(2, '0')}</b><small>{MONTHS[d.getMonth()]}</small></span>
                      <span class="sess-main">
                        <b>{s.title || 'Séance'}</b>
                        <small>{runs} passage{runs > 1 ? 's' : ''}{s.coachName ? ` · ${s.coachName}` : ''}</small>
                      </span>
                      <span class="sess-best">
                        <b class="mono">{best !== undefined ? fmtDuration(best) : '—'}</b>
                        <small>{rank ? `${rank}${rank === 1 ? 'er' : 'e'} / ${of}` : 'pas de temps'}</small>
                      </span>
                      <Icon name="right" size={18} />
                    </button>
                  </li>
                )
              })}
            </ul>
            <div style={{ height: 24 }} />
          </div>
        </div>
      ) : (
        <AthleteProfile user={user} profile={profile} onLinked={load} />
      )}
      <nav class="tabbar two" aria-label="Navigation" style={{ '--i': tab === 'results' ? 0 : 1, '--n': 2 }}>
        <button class={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}><Icon name="stopwatch" size={22} stroke={2} /><span>Résultats</span></button>
        <button class={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}><Icon name="user" size={22} stroke={2} /><span>Profil</span></button>
      </nav>
    </div>
  )
}

function AthleteProfile({ user, profile, onLinked }: { user: User; profile: Profile | null; onLinked: () => void }) {
  const [licence, setLicence] = useState('')
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const link = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase!.rpc('claim_licence', { p_licence: licence.trim(), p_nom: nom.trim() })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: frError(error) })
    const l = (data as any[])[0]
    setMsg({ ok: true, text: `Compte relié à ${l.prenom} ${l.nom}${l.club ? ` (${l.club})` : ''}.` })
    onLinked()
  }

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head"><div><span class="label">Profil athlète</span><h1>{profile?.name || 'Athlète'}</h1></div></header>
        <p class="muted" style={{ marginTop: 0 }}>{user.email}</p>

        <div class="sec-head"><h2>Ma licence FFCK</h2></div>
        {profile?.licence ? (
          <p class="lic-linked"><b class="mono">n° {profile.licence}</b>{profile.club && <span>{profile.club}</span>}</p>
        ) : (
          <form class="login-form" onSubmit={link} style={{ marginTop: 12 }}>
            <label>
              <span class="label">Numéro de licence</span>
              <input value={licence} onInput={(e) => setLicence((e.target as HTMLInputElement).value)} inputMode="numeric" autocomplete="off" required />
            </label>
            <label>
              <span class="label">Nom de famille</span>
              <input value={nom} onInput={(e) => setNom((e.target as HTMLInputElement).value)} autocapitalize="characters" autocomplete="family-name" required />
            </label>
            {msg && <p class={`form-msg ${msg.ok ? '' : 'err'}`} role="status">{msg.text}</p>}
            <button class="btn primary" type="submit" disabled={busy}>Relier ma licence</button>
          </form>
        )}
        {msg?.ok && profile?.licence && <p class="form-msg">{msg.text}</p>}

        <div class="sec-head"><h2>Confidentialité</h2></div>
        <p class="privacy">
          Tes chronos sont visibles par les coachs et les athlètes connectés à TCK Chrono, jamais publiquement sur internet.
          Pour ne plus apparaître dans la liste des licenciés utilisée par l'app, demande-le à ton club : tu seras retiré et jamais réimporté.
        </p>
        <button class="btn outline" style={{ marginTop: 20 }} onClick={signOut}>Se déconnecter</button>
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
