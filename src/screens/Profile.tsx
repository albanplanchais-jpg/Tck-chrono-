import { useMemo, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import { uid, type Athlete, type Session } from '../core/model'
import { athleteStats, summarize, totals, type AthleteStats } from '../core/stats'
import { fmtDay, fmtDuration } from '../core/format'
import { label, parseBib } from '../core/startOrder'
import { useSettings } from '../store/settings'
import { archiveAthlete, saveAthletes, updateProfile } from '../cloud/history'
import { signOut } from '../cloud/auth'
import { frError } from '../cloud/supabase'
import { exportAllXlsx } from '../device/share'
import { SessionItem } from '../components/SessionItem'
import { Icon } from '../components/Icon'

interface Props {
  user: User | null
  group: Athlete[]
  sessions: Session[]
  onAddAthlete: (a: Athlete) => void
  onRemoveAthlete: (id: string) => void
  onOpenSession: (s: Session) => void
  onAllSessions: () => void
  onProfileSaved: () => void
}

const initials = (n: string) =>
  n.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'C'

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <button class="set-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span><b>{title}</b><small>{sub}</small></span>
      <span class={`switch ${on ? 'on' : ''}`} aria-hidden="true" />
    </button>
  )
}

/** Profil du coach : statistiques, groupe d'athlètes, dernières séances et réglages. */
export function Profile({ user, group, sessions, onAddAthlete, onRemoveAthlete, onOpenSession, onAllSessions, onProfileSaved }: Props) {
  const [settings, set] = useSettings()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [open, setOpen] = useState<AthleteStats | null>(null)
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')

  const meta = (user?.user_metadata ?? {}) as { name?: string; discipline?: string; club?: string }
  const coachName = meta.name || user?.email || 'Coach'
  const stats = useMemo(() => athleteStats(group, sessions), [group, sessions])
  const tot = useMemo(() => totals(sessions, group), [sessions, group])
  const recent = useMemo(() => sessions.slice(0, 3).map(summarize), [sessions])

  const add = async (e: Event) => {
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

  const exportAll = async () => {
    if (!sessions.length) return setMsg('Aucune séance à exporter.')
    try {
      const r = await exportAllXlsx(sessions)
      if (r === 'downloaded') setMsg('Fichier Excel téléchargé.')
    } catch {
      setMsg('Export impossible sur cet appareil.')
    }
  }

  return (
    <div class="screen tabbed profile">
      <div class="scroll">
        <header class="px page-head">
          <span class="label">Profil</span>
          <button class="icon-btn" onClick={exportAll} aria-label="Exporter toutes mes séances"><Icon name="share" size={18} /></button>
        </header>

        <section class="px coach">
          <div class="avatar" aria-hidden="true">{initials(coachName)}</div>
          <div class="coach-id">
            <h1>{coachName}</h1>
            <span class="role">Coach{meta.discipline ? ` · ${meta.discipline}` : ''}</span>
            <span class="club"><img src="/logo.png" alt="" width={20} height={20} />{meta.club || 'Torcy Canoë-Kayak'}</span>
          </div>
        </section>

        <div class="px">
          <div class="statbox">
            <div><b class="mono">{tot.sessions}</b><span>Séances</span></div>
            <div><b class="mono">{tot.athletes}</b><span>Athlètes</span></div>
            <div><b class="mono">{tot.passages.toLocaleString('fr-FR')}</b><span>Passages</span></div>
          </div>
        </div>

        <section class="px block">
          <div class="sec-head"><h2>Mon groupe</h2><span class="label">Meilleur temps</span></div>
          {stats.length === 0 && <p class="muted">Aucun athlète pour l'instant. Ajoute-les ici ou lors d'une séance.</p>}
          <ul class="group">
            {stats.map((st, i) => (
              <li key={st.athlete.id}>
                <button onClick={() => setOpen(st)}>
                  <span class="idx mono">{String(i + 1).padStart(2, '0')}</span>
                  <span class="g-name">
                    <b>{st.athlete.bib !== undefined && <span class="bibn mono">{st.athlete.bib}</span>}{st.athlete.name}</b>
                    <small>{st.sessions} séance{st.sessions > 1 ? 's' : ''}</small>
                  </span>
                  <span class="mono g-time">{st.best !== undefined ? fmtDuration(st.best) : '—'}</span>
                  <Icon name="right" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <form class="field add-ath" onSubmit={add}>
              <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Nom de l'athlète" autocapitalize="words" maxLength={40} autoFocus />
              <input class="bib-in mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="n°" inputMode="numeric" aria-label="Dossard" />
              <button type="submit" class="add" aria-label="Ajouter"><Icon name="plus" size={26} stroke={2.6} /></button>
            </form>
          ) : (
            <button class="soft-btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} stroke={2.6} />Ajouter un athlète</button>
          )}
        </section>

        <section class="px block">
          <div class="sec-head"><h2>Dernières séances</h2>{sessions.length > 3 && <button class="link-sm" onClick={onAllSessions}>Tout voir</button>}</div>
          {!recent.length && <p class="muted">Pas encore de séance.</p>}
          <ul class="sess-list">
            {recent.map((sum) => <SessionItem key={sum.session.id} sum={sum} onOpen={() => onOpenSession(sum.session)} />)}
          </ul>
        </section>

        <section class="px block">
          <div class="sec-head"><h2>Réglages du chrono</h2></div>
          <span class="set-label">Précision affichée</span>
          <div class="segment n2 prec">
            <button class={`mono ${settings.precision === 1 ? 'on' : ''}`} onClick={() => set({ precision: 1 })}>00:00.0</button>
            <button class={`mono ${settings.precision === 2 ? 'on' : ''}`} onClick={() => set({ precision: 2 })}>00:00.00</button>
          </div>
          <Toggle on={settings.vibrate} onChange={(v) => set({ vibrate: v })} title="Vibration au tap" sub="Un retour court sous le doigt à chaque capture (Android)" />
          <Toggle on={settings.wakeLock} onChange={(v) => set({ wakeLock: v })} title="Garder l'écran allumé" sub="Pendant une séance en cours" />
          <Toggle on={settings.beep} onChange={(v) => set({ beep: v })} title="Bip de confirmation" sub="Utile si le téléphone reste dans la poche" />
        </section>

        <section class="px block end">
          {msg && <p class="form-msg" role="status">{msg}</p>}
          {user && <button class="btn outline" onClick={() => setEditing(true)}>Modifier le profil</button>}
          <button class="link" onClick={exportAll}>Exporter toutes mes séances</button>
          {user && <button class="link dim" onClick={signOut}>Se déconnecter</button>}
          <p class="version mono">TCK Chrono · v1.1</p>
        </section>
      </div>

      {open && (
        <AthletePage
          st={open}
          onClose={() => setOpen(null)}
          onOpenSession={onOpenSession}
          onSave={(a) => { onAddAthlete(a); saveAthletes([a]); setOpen({ ...open, athlete: a }) }}
          onRemove={() => { archiveAthlete(open.athlete.id); onRemoveAthlete(open.athlete.id); setOpen(null) }}
        />
      )}
      {editing && user && (
        <EditProfile
          meta={{ name: meta.name ?? '', discipline: meta.discipline ?? '', club: meta.club ?? 'Torcy Canoë-Kayak' }}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onProfileSaved() }}
        />
      )}
    </div>
  )
}

function AthletePage({ st, onClose, onOpenSession, onSave, onRemove }: {
  st: AthleteStats
  onClose: () => void
  onOpenSession: (s: Session) => void
  onSave: (a: Athlete) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(st.athlete.name)
  const [bib, setBib] = useState(st.athlete.bib !== undefined ? String(st.athlete.bib) : '')
  const [confirm, setConfirm] = useState(false)
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

function EditProfile({ meta, onClose, onSaved }: { meta: { name: string; discipline: string; club: string }; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await updateProfile({ name: v.name.trim(), discipline: v.discipline.trim(), club: v.club.trim() })
      onSaved()
    } catch (err) {
      setError(frError(err))
    } finally {
      setBusy(false)
    }
  }
  const field = (k: keyof typeof v, lbl: string, ph: string) => (
    <label>
      <span class="label">{lbl}</span>
      <input value={v[k]} placeholder={ph} maxLength={60} onInput={(e) => setV({ ...v, [k]: (e.target as HTMLInputElement).value })} />
    </label>
  )
  return (
    <div class="modal-wrap" onClick={onClose}>
      <form class="modal login-form" onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <h2>Modifier le profil</h2>
        {field('name', 'Prénom et nom', 'Erwan Kerdal')}
        {field('discipline', 'Discipline', 'Descente, slalom, course en ligne…')}
        {field('club', 'Club', 'Torcy Canoë-Kayak')}
        {error && <p class="form-msg err">{error}</p>}
        <button class="btn primary" type="submit" disabled={busy}>Enregistrer</button>
        <button class="btn outline" type="button" onClick={onClose}>Annuler</button>
      </form>
    </div>
  )
}
