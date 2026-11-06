import { useMemo, useState } from 'preact/hooks'
import { uid, type Athlete, type Course, type Session } from '../core/model'
import { athleteCourseBests, athleteStats, sameAthlete, type AthleteStats } from '../core/stats'
import { fmtDay, fmtDuration } from '../core/format'
import { label, parseBib } from '../core/startOrder'
import { archiveAthlete, saveAthletes } from '../cloud/history'
import { Icon } from '../components/Icon'
import { LinksPanel } from '../components/LinksPanel'
import { supabase } from '../cloud/supabase'
import type { Link } from '../cloud/links'

interface Props {
  group: Athlete[]
  sessions: Session[]
  courses: Course[]
  onAddAthlete: (a: Athlete) => void
  onRemoveAthlete: (id: string) => void
  onOpenSession: (s: Session) => void
}

/** Athlètes enregistrés : meilleur temps, séances, fiche avec records par parcours. */
export function Athletes({ group, sessions, courses, onAddAthlete, onRemoveAthlete, onOpenSession }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const stats = useMemo(() => athleteStats(group, sessions), [group, sessions])
  const shown = q.trim()
    ? stats.filter((s) => `${s.athlete.bib ?? ''} ${s.athlete.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    : stats
  const open = stats.find((s) => s.athlete.id === openId)

  // Athlète relié (compte) : ajouté au groupe s'il n'y est pas déjà (même licence ou même nom).
  const syncLinked = (links: Link[]) => {
    const fresh = links
      .map((l): Athlete => ({ id: uid(), name: l.name.slice(0, 40), ...(l.licence ? { licence: l.licence } : {}), ...(l.club ? { club: l.club } : {}) }))
      .filter((a) => !group.some((g) => sameAthlete(g, a)))
    fresh.forEach(onAddAthlete)
    if (fresh.length) saveAthletes(fresh)
  }

  const add = (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const b = parseBib(bib)
    const a: Athlete = { id: uid(), name: n, ...(b !== undefined ? { bib: b } : {}) }
    onAddAthlete(a)
    saveAthletes([a])
    setName('')
    setBib('')
    setAdding(false)
  }

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head">
          <div>
            <span class="label">{group.length} athlète{group.length > 1 ? 's' : ''} enregistré{group.length > 1 ? 's' : ''}</span>
            <h1>Athlètes</h1>
          </div>
          <button class="icon-btn" onClick={() => setAdding(true)} aria-label="Ajouter un athlète"><Icon name="plus" size={20} stroke={2.6} /></button>
        </header>

        {adding && (
          <form class="field add-ath" onSubmit={add} style={{ marginTop: 0, marginBottom: 12 }}>
            <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Nom de l'athlète" autocapitalize="words" maxLength={40} autoFocus />
            <input class="bib-in mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="n°" inputMode="numeric" aria-label="Dossard" />
            <button type="submit" class="add" aria-label="Ajouter"><Icon name="plus" size={26} stroke={2.6} /></button>
          </form>
        )}

        {group.length > 6 && (
          <input class="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Rechercher un nom ou un dossard" aria-label="Rechercher" />
        )}

        <div class="sec-head" style={{ paddingTop: 12 }}><h2>Mon groupe</h2><span class="label">Meilleur temps</span></div>
        {stats.length === 0 && (
          <p class="muted">Aucun athlète pour l'instant. Ajoute-les ici, ou ils seront enregistrés automatiquement à ta prochaine séance.</p>
        )}
        <ul class="group">
          {shown.map((st, i) => (
            <li key={st.athlete.id}>
              <button onClick={() => setOpenId(st.athlete.id)}>
                <span class="idx mono">{String(i + 1).padStart(2, '0')}</span>
                <span class="g-name">
                  <b>{st.athlete.bib !== undefined && <span class="bibn mono">{st.athlete.bib}</span>}{st.athlete.name}</b>
                  <small>{st.sessions} séance{st.sessions > 1 ? 's' : ''} · {st.passages} passage{st.passages > 1 ? 's' : ''}</small>
                </span>
                <span class="mono g-time">{st.best !== undefined ? fmtDuration(st.best) : '—'}</span>
                <Icon name="right" size={18} />
              </button>
            </li>
          ))}
        </ul>
        {!adding && (
          <button class="soft-btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} stroke={2.6} />Ajouter un athlète</button>
        )}

        {supabase && (
          <>
            <div class="sec-head"><h2>Comptes athlètes</h2></div>
            <LinksPanel role="coach" onLinks={syncLinked} />
          </>
        )}
        <div style={{ height: 24 }} />
      </div>

      {open && (
        <AthletePage
          st={open}
          courses={courses}
          sessions={sessions}
          onClose={() => setOpenId(null)}
          onOpenSession={onOpenSession}
          onSave={(a) => { onAddAthlete(a); saveAthletes([a]) }}
          onRemove={() => { archiveAthlete(open.athlete.id); onRemoveAthlete(open.athlete.id); setOpenId(null) }}
        />
      )}
    </div>
  )
}

function AthletePage({ st, courses, sessions, onClose, onOpenSession, onSave, onRemove }: {
  st: AthleteStats
  courses: Course[]
  sessions: Session[]
  onClose: () => void
  onOpenSession: (s: Session) => void
  onSave: (a: Athlete) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(st.athlete.name)
  const [bib, setBib] = useState(st.athlete.bib !== undefined ? String(st.athlete.bib) : '')
  const [confirm, setConfirm] = useState(false)
  const bests = useMemo(() => athleteCourseBests(st.athlete, courses, sessions), [st.athlete, courses, sessions])
  const dirty = name.trim() !== st.athlete.name || (parseBib(bib) ?? null) !== (st.athlete.bib ?? null)
  const save = () => {
    const n = name.trim()
    if (!n) return
    const b = parseBib(bib)
    const { bib: _old, ...rest } = st.athlete
    onSave({ ...rest, name: n, ...(b !== undefined ? { bib: b } : {}) })
  }

  return (
    <div class="layer">
      <header class="px layer-head">
        <div>
          <span class="label">Athlète</span>
          <h2>{label(st.athlete)}</h2>
        </div>
        <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={26} /></button>
      </header>
      <div class="scroll px">
        <div class="statbox">
          <div><b class="mono">{st.best !== undefined ? fmtDuration(st.best) : '—'}</b><span>Meilleur</span></div>
          <div><b class="mono">{st.sessions}</b><span>Séances</span></div>
          <div><b class="mono">{st.passages}</b><span>Passages</span></div>
        </div>

        {bests.length > 0 && (
          <>
            <div class="sec-head"><h2>Records par parcours</h2></div>
            <ul class="perf">
              {bests.map((b) => (
                <li key={b.course.id}>
                  <button onClick={() => onOpenSession(b.session)}>
                    <span class="p-main">
                      <b><Icon name="flag" size={14} stroke={2.4} />&nbsp;{b.course.name}</b>
                      <small>{fmtDay(b.session.createdAt)} · {b.rank === 1 ? 'record du parcours' : `${b.rank}e sur ${b.of}`}</small>
                    </span>
                    <span class="mono g-time">{fmtDuration(b.best)}{b.rank === 1 && <i class="pb">RECORD</i>}</span>
                    <Icon name="right" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div class="sec-head"><h2>Ses séances</h2></div>
        {!st.history.length && <p class="muted">Pas encore de temps enregistré.</p>}
        <ul class="perf">
          {st.history.map((h) => (
            <li key={h.session.id}>
              <button onClick={() => onOpenSession(h.session)}>
                <span class="p-main">
                  <b>{h.session.title || 'Séance'}</b>
                  <small>{fmtDay(h.session.createdAt)} · {h.runs.length} passage{h.runs.length > 1 ? 's' : ''}</small>
                </span>
                <span class="mono g-time">{h.best !== undefined ? fmtDuration(h.best) : '—'}{h.best === st.best && <i class="pb">RECORD</i>}</span>
                <Icon name="right" size={18} />
              </button>
            </li>
          ))}
        </ul>

        <div class="sec-head"><h2>Modifier</h2></div>
        <div class="field">
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} maxLength={40} aria-label="Nom" />
          <input class="bib-in mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="n°" inputMode="numeric" aria-label="Dossard" />
        </div>
        <button class="btn primary" style={{ marginTop: 10 }} disabled={!dirty || !name.trim()} onClick={save}>Enregistrer</button>
        {confirm ? (
          <div class="danger">
            <p>Retirer {st.athlete.name} du groupe ? Ses temps restent dans l'historique des séances.</p>
            <div class="row2">
              <button class="btn outline" onClick={() => setConfirm(false)}>Garder</button>
              <button class="btn primary" onClick={onRemove}>Retirer</button>
            </div>
          </div>
        ) : (
          <button class="link dim" style={{ alignSelf: 'center', margin: '8px auto 30px', display: 'block' }} onClick={() => setConfirm(true)}>Retirer du groupe</button>
        )}
      </div>
    </div>
  )
}

