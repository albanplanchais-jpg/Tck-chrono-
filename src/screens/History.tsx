import { useMemo } from 'preact/hooks'
import type { Session } from '../core/model'
import { summarize } from '../core/stats'
import { SessionItem } from '../components/SessionItem'
import { Icon } from '../components/Icon'

interface Props {
  sessions: Session[]
  loading: boolean
  source: 'cloud' | 'local'
  onOpen: (s: Session) => void
  onRefresh: () => void
}

/** Toutes les séances du coach, de la plus récente à la plus ancienne, regroupées par mois. */
export function History({ sessions, loading, source, onOpen, onRefresh }: Props) {
  const months = useMemo(() => {
    const out: { label: string; items: ReturnType<typeof summarize>[] }[] = []
    for (const s of sessions) {
      const label = new Date(s.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      const cap = label.charAt(0).toUpperCase() + label.slice(1)
      if (out[out.length - 1]?.label !== cap) out.push({ label: cap, items: [] })
      out[out.length - 1].items.push(summarize(s))
    }
    return out
  }, [sessions])

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head">
          <div>
            <span class="label">Historique</span>
            <h1>Mes séances</h1>
          </div>
          <button class="icon-btn" onClick={onRefresh} aria-label="Actualiser"><Icon name="undo" size={18} /></button>
        </header>
        {source === 'local' && sessions.length > 0 && (
          <p class="note">Hors ligne : séances enregistrées sur ce téléphone.</p>
        )}

        {loading && !sessions.length ? (
          <p class="muted" style={{ padding: '24px 0' }}>Chargement…</p>
        ) : !sessions.length ? (
          <div class="empty-state">
            <div class="ico"><Icon name="stopwatch" size={24} stroke={1.8} /></div>
            <h3>Aucune séance</h3>
            <p>Les séances que tu chronomètres apparaîtront ici, avec les temps de chaque athlète.</p>
          </div>
        ) : (
          months.map((m) => (
            <section key={m.label} class="month">
              <div class="sec-head"><h2>{m.label}</h2><span class="label">{m.items.length} séance{m.items.length > 1 ? 's' : ''}</span></div>
              <ul class="sess-list">
                {m.items.map((sum) => <SessionItem key={sum.session.id} sum={sum} onOpen={() => onOpen(sum.session)} />)}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
