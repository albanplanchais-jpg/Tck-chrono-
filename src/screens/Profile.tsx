import { useMemo, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import type { Athlete, Session } from '../core/model'
import { summarize, totals } from '../core/stats'
import { useSettings } from '../store/settings'
import { updateProfile } from '../cloud/history'
import { signOut } from '../cloud/auth'
import { frError } from '../cloud/supabase'
import { exportAllXlsx } from '../device/share'
import { SessionItem } from '../components/SessionItem'
import { Icon } from '../components/Icon'

interface Props {
  user: User | null
  group: Athlete[]
  sessions: Session[]
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
export function Profile({ user, group, sessions, onOpenSession, onAllSessions, onProfileSaved }: Props) {
  const [settings, set] = useSettings()
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')

  const meta = (user?.user_metadata ?? {}) as { name?: string; discipline?: string; club?: string }
  const coachName = meta.name || user?.email || 'Coach'
  const tot = useMemo(() => totals(sessions, group), [sessions, group])
  const recent = useMemo(() => sessions.slice(0, 3).map(summarize), [sessions])

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
