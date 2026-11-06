import { useEffect, useMemo, useState } from 'preact/hooks'
import { uid, type Athlete, type Course, type Session } from '../core/model'
import { athleteCourseBests, athleteStats, sameAthlete, type AthleteStats } from '../core/stats'
import { fold } from '../ffck/search'
import { fmtDay, fmtDuration } from '../core/format'
import { parseBib } from '../core/startOrder'
import { archiveAthlete, saveAthletes } from '../cloud/history'
import { Icon } from '../components/Icon'
import { LinksPanel } from '../components/LinksPanel'
import { supabase } from '../cloud/supabase'
import { myLinks, type Link } from '../cloud/links'

interface Props {
  group: Athlete[]
  sessions: Session[]
  courses: Course[]
  onAddAthlete: (a: Athlete) => void
  onRemoveAthlete: (id: string) => void
  onOpenSession: (s: Session) => void
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

/** Athlètes : une liste simple (nom, dossard) ; un toucher ouvre la fiche avec tous ses chronos. */
export function Athletes({ group, sessions, courses, onAddAthlete, onRemoveAthlete, onOpenSession }: Props) {
  const [adding, setAdding] = useState(false)
  const [accounts, setAccounts] = useState(false)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const stats = useMemo(() => athleteStats(group, sessions), [group, sessions])
  const sorted = useMemo(() => [...stats].sort((a, b) => a.athlete.name.localeCompare(b.athlete.name, 'fr')), [stats])
  const needle = fold(q.trim())
  const shown = needle ? sorted.filter((s) => fold(`${s.athlete.bib ?? ''} ${s.athlete.name}`).includes(needle)) : sorted
  const open = stats.find((s) => s.athlete.id === openId)
  const accepted = links.filter((l) => l.status === 'accepted')
  const incoming = links.filter((l) => l.status === 'pending' && l.incoming).length
  const hasAccount = (a: Athlete) => accepted.some((l) => sameAthlete(a, { id: '', name: l.name, ...(l.licence ? { licence: l.licence } : {}) }))

  // Athlète relié (compte) : ajouté au groupe s'il n'y est pas déjà (même licence ou même nom).
  const syncLinked = (list: Link[]) => {
    setLinks((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list))
    const fresh = list
      .filter((l) => l.status === 'accepted')
      .map((l): Athlete => ({ id: uid(), name: l.name.slice(0, 40), ...(l.licence ? { licence: l.licence } : {}), ...(l.club ? { club: l.club } : {}) }))
      .filter((a) => !group.some((g) => sameAthlete(g, a)))
    fresh.forEach(onAddAthlete)
    if (fresh.length) saveAthletes(fresh)
  }
  useEffect(() => {
    if (supabase) myLinks().then(syncLinked).catch(() => {})
  }, [])

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head">
          <div>
            <span class="label">{group.length} athlète{group.length > 1 ? 's' : ''}</span>
            <h1>Athlètes</h1>
          </div>
          <button class="icon-btn" onClick={() => setAdding(true)} aria-label="Ajouter un athlète"><Icon name="plus" size={20} stroke={2.6} /></button>
        </header>

        {supabase && (
          <button class={`accounts-btn ${incoming ? 'alert' : ''}`} onClick={() => setAccounts(true)}>
            <Icon name="users" size={20} />
            <span>
              <b>{incoming ? `${incoming} demande${incoming > 1 ? 's' : ''} de compte` : 'Comptes athlètes'}</b>
              <small>{incoming ? 'Un athlète veut te relier' : accepted.length ? `${accepted.length} relié${accepted.length > 1 ? 's' : ''}` : 'Relier les athlètes inscrits'}</small>
            </span>
            {incoming > 0 ? <i class="badge-n">{incoming}</i> : <span />}
            <Icon name="right" size={18} />
          </button>
        )}

        {group.length > 0 && (
          <input class="search ath-search" type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Rechercher un athlète" aria-label="Rechercher un athlète" />
        )}

        {!group.length ? (
          <div class="empty-state">
            <div class="ico"><Icon name="users" size={24} stroke={1.8} /></div>
            <h3>Aucun athlète</h3>
            <p>Ajoute tes athlètes ici, ou ils seront enregistrés automatiquement à ta prochaine séance.</p>
            <button class="btn primary" style={{ marginTop: 18 }} onClick={() => setAdding(true)}><Icon name="plus" size={20} />Ajouter un athlète</button>
          </div>
        ) : (
          <ul class="ath-list">
            {shown.map((st) => (
              <li key={st.athlete.id}>
                <button onClick={() => setOpenId(st.athlete.id)}>
                  <span class="ath-av">{initials(st.athlete.name)}</span>
                  <span class="ath-name">
                    <b>{st.athlete.name}</b>
                    {hasAccount(st.athlete) && <small><Icon name="check" size={12} stroke={3} /> compte relié</small>}
                  </span>
                  {st.athlete.bib !== undefined ? <span class="bibn mono">{st.athlete.bib}</span> : <span />}
                  <Icon name="right" size={18} />
                </button>
              </li>
            ))}
            {!shown.length && <li class="muted ath-none">Personne ne correspond à « {q} ».</li>}
          </ul>
        )}
        <div style={{ height: 24 }} />
      </div>

      {open && (
        <AthletePage
          st={open}
          courses={courses}
          sessions={sessions}
          linked={hasAccount(open.athlete)}
          onClose={() => setOpenId(null)}
          onOpenSession={onOpenSession}
          onSave={(a) => { onAddAthlete(a); saveAthletes([a]) }}
          onRemove={() => { archiveAthlete(open.athlete.id); onRemoveAthlete(open.athlete.id); setOpenId(null) }}
        />
      )}

      {adding && (
        <AthleteForm
          title="Nouvel athlète"
          submit="Ajouter"
          onClose={() => setAdding(false)}
          onSave={(a) => {
            const athlete: Athlete = { id: uid(), ...a }
            onAddAthlete(athlete)
            saveAthletes([athlete])
            setAdding(false)
          }}
        />
      )}

      {accounts && (
        <div class="layer">
          <header class="px layer-head">
            <div>
              <span class="label">Athlètes inscrits sur l'app</span>
              <h2>Comptes athlètes</h2>
            </div>
            <button class="rm" onClick={() => setAccounts(false)} aria-label="Fermer"><Icon name="x" size={26} /></button>
          </header>
          <div class="scroll px">
            <p class="muted" style={{ marginTop: 0 }}>Un athlète relié voit ses chronos dans son espace, et il rejoint ton groupe automatiquement.</p>
            <LinksPanel role="coach" onLinks={syncLinked} />
            <div style={{ height: 30 }} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Ajout / modification : nom et dossard. */
function AthleteForm({ title, submit, athlete, onClose, onSave }: {
  title: string
  submit: string
  athlete?: Athlete
  onClose: () => void
  onSave: (a: Omit<Athlete, 'id'>) => void
}) {
  const [name, setName] = useState(athlete?.name ?? '')
  const [bib, setBib] = useState(athlete?.bib !== undefined ? String(athlete.bib) : '')
  const go = (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const b = parseBib(bib)
    const { id: _id, bib: _b, ...rest } = athlete ?? ({} as Athlete)
    onSave({ ...rest, name: n.slice(0, 40), ...(b !== undefined ? { bib: b } : {}) })
  }
  return (
    <div class="modal-wrap" onClick={onClose}>
      <form class="modal login-form" onSubmit={go} onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>{title}</h2>
          <button type="button" class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>
        <label>
          <span class="label">Nom et prénom</span>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Emma Martin" autocapitalize="words" maxLength={40} required autoFocus />
        </label>
        <label>
          <span class="label">Dossard · facultatif</span>
          <input class="mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="12" inputMode="numeric" />
        </label>
        <button class="btn primary" type="submit" disabled={!name.trim()}>{submit}</button>
      </form>
    </div>
  )
}

/** Fiche d'un athlète : record, records par parcours, et tous ses chronos séance par séance. */
function AthletePage({ st, courses, sessions, linked, onClose, onOpenSession, onSave, onRemove }: {
  st: AthleteStats
  courses: Course[]
  sessions: Session[]
  linked: boolean
  onClose: () => void
  onOpenSession: (s: Session) => void
  onSave: (a: Athlete) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const a = st.athlete
  const bests = useMemo(() => athleteCourseBests(a, courses, sessions), [a, courses, sessions])
  const courseName = (s: Session) => courses.find((c) => c.id === s.courseId)?.name

  return (
    <div class="layer ath-page">
      <header class="px layer-head">
        <span />
        <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={26} /></button>
      </header>
      <div class="scroll px">
        <div class="ath-hero">
          <span class="ath-av big">{initials(a.name)}</span>
          <h2>{a.name}</h2>
          <p>
            {[a.bib !== undefined ? `Dossard ${a.bib}` : null, a.club, a.licence ? `Licence ${a.licence}` : null].filter(Boolean).join(' · ') || 'Athlète du groupe'}
          </p>
          {linked && <span class="ath-linked"><Icon name="check" size={13} stroke={3} />Compte relié</span>}
        </div>

        <div class="statbox">
          <div><b class="mono">{st.best !== undefined ? fmtDuration(st.best) : '—'}</b><span>Record</span></div>
          <div><b class="mono">{st.sessions}</b><span>Séances</span></div>
          <div><b class="mono">{st.passages}</b><span>Passages</span></div>
        </div>

        {bests.length > 0 && (
          <>
            <div class="sec-head"><h2>Ses records</h2><span class="label">par parcours</span></div>
            <div class="rec-cards">
              {bests.map((b) => (
                <button key={b.course.id} class="rec-card" onClick={() => onOpenSession(b.session)}>
                  <small><Icon name="flag" size={12} stroke={2.6} /> {b.course.name}</small>
                  <b class="mono">{fmtDuration(b.best)}</b>
                  <small>{b.rank === 1 ? 'Record du parcours' : `${b.rank}e sur ${b.of}`}</small>
                </button>
              ))}
            </div>
          </>
        )}

        <div class="sec-head"><h2>Ses chronos</h2><span class="label">{st.history.length} séance{st.history.length > 1 ? 's' : ''}</span></div>
        {!st.history.length && <p class="muted">Pas encore de temps. Ils apparaîtront ici après sa première séance.</p>}
        <ul class="chrono-list">
          {st.history.map((h) => (
            <li key={h.session.id}>
              <button onClick={() => onOpenSession(h.session)}>
                <span class="cl-head">
                  <span class="cl-title">
                    <b>{h.session.title || courseName(h.session) || 'Séance'}</b>
                    <small>{fmtDay(h.session.createdAt)}{courseName(h.session) && h.session.title !== courseName(h.session) ? ` · ${courseName(h.session)}` : ''}</small>
                  </span>
                  <span class="cl-best mono">
                    {h.best !== undefined ? fmtDuration(h.best) : '—'}
                    {h.best !== undefined && h.best === st.best && <i class="pb">RECORD</i>}
                  </span>
                </span>
                {h.runs.length > 1 || h.splits.some((s) => s.length) ? (
                  <span class="cl-runs">
                    {h.runs.map((t, i) => (
                      <span key={i} class={`run-chip mono ${t === h.best && h.runs.length > 1 ? 'best' : ''}`}>
                        <small>P{i + 1}</small>{fmtDuration(t)}
                        {h.splits[i]?.length ? <em>{h.splits[i].map((sp, j) => `INT${j + 1} ${fmtDuration(sp)}`).join(' · ')}</em> : null}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        <div class="row2" style={{ marginTop: 22 }}>
          <button class="btn outline" onClick={() => setEditing(true)}>Modifier</button>
          <button class="btn outline" onClick={() => setConfirm(true)}>Retirer</button>
        </div>
        {confirm && (
          <div class="danger">
            <p>Retirer {a.name} du groupe ? Ses temps restent dans l'historique des séances.</p>
            <div class="row2">
              <button class="btn outline" onClick={() => setConfirm(false)}>Garder</button>
              <button class="btn primary" onClick={onRemove}>Retirer</button>
            </div>
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>

      {editing && (
        <AthleteForm
          title="Modifier l'athlète"
          submit="Enregistrer"
          athlete={a}
          onClose={() => setEditing(false)}
          onSave={(v) => { onSave({ ...v, id: a.id }); setEditing(false) }}
        />
      )}
    </div>
  )
}
