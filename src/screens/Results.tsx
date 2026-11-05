import { useMemo, useState } from 'preact/hooks'
import type { Athlete, Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDay, fmtDuration, fmtGap, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { exportXlsx, shareWhatsApp } from '../device/share'
import { Icon } from '../components/Icon'
import { TapLog } from '../components/TapLog'
import { SessionInfo } from '../components/SessionInfo'

/** Résultats d'une séance. Sans `store` : séance passée, consultée depuis l'historique (lecture seule). */
export function Results({ store, session, onBack, onEditMeta, highlight }: {
  store?: Store
  session: Session
  onBack?: () => void
  /** Séance passée : enregistre le nouveau nom / commentaire. */
  onEditMeta?: (v: { title?: string; comment?: string }) => Promise<void>
  /** Espace athlète : met en avant ses propres lignes. */
  highlight?: (a: Athlete) => boolean
}) {
  const rows = useMemo(() => ranking(session), [session])
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [log, setLog] = useState(false)
  const [info, setInfo] = useState(false)

  const excel = async () => {
    try {
      const r = await exportXlsx(session)
      if (r === 'downloaded') {
        setMsg('Fichier Excel téléchargé')
        setTimeout(() => setMsg(''), 2500)
      }
    } catch {
      setMsg('Export impossible sur cet appareil')
      setTimeout(() => setMsg(''), 2500)
    }
  }

  return (
    <div class="screen results">
      <header class="px" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {onBack && (
            <button class="back" onClick={onBack}><Icon name="left" size={18} stroke={2.6} />Historique</button>
          )}
          <span class="label">{session.endedAt ? 'Séance terminée' : 'Séance en cours'}</span>
          <h1>{session.title || 'Résultats'}</h1>
          {session.coachName && !store && !onEditMeta && <span class="res-coach">Chronométrée par {session.coachName}</span>}
          {(store || onEditMeta) && <button class="edit-meta" onClick={() => setInfo(true)}><Icon name="edit" size={13} stroke={2.4} />{session.comment ? 'Modifier' : 'Nom, commentaire'}</button>}
          <span class="res-sub">{fmtDay(session.createdAt)} · {fmtHM(session.createdAt)}{session.endedAt ? ` – ${fmtHM(session.endedAt)}` : ''}</span>
        </div>
        {store && (
          <div class="res-actions">
            <button class="link" onClick={() => setLog(true)}>Corriger</button>
            <button class="link" onClick={store.resume}>Reprendre</button>
          </div>
        )}
      </header>

      {session.comment && <p class="px res-comment">« {session.comment} »</p>}

      <div class="cols label" style={{ fontSize: 12 }}>
        <span>Rang</span><span>Athlète</span><span>Meilleur</span>
      </div>

      <ol class={`scroll ranking ${rows.length > 8 ? 'dense' : ''}`}>
        {rows.map((r) => {
          const expanded = open === r.athlete.id
          const multi = r.runs.length > 1 || r.runs.some((x) => x.splits.length > 0)
          return (
            <li key={r.athlete.id} class={`${r.rank === 1 ? 'first' : ''} ${highlight?.(r.athlete) ? 'me-row' : ''}`}>
              <button
                class={`rank-row ${r.best === undefined ? 'nt' : ''}`}
                aria-expanded={multi ? expanded : undefined}
                onClick={() => multi && setOpen(expanded ? null : r.athlete.id)}
              >
                <span class="rk">{r.rank ?? '–'}</span>
                <span style={{ minWidth: 0 }}>
                  <span class="nm">{r.athlete.bib !== undefined && <span class="bibn mono">{r.athlete.bib}</span>}{r.athlete.name}</span>
                  <span class="sub">{r.runs.length} passage{r.runs.length > 1 ? 's' : ''}</span>
                </span>
                <span>
                  <span class="tm">{r.best !== undefined ? fmtDuration(r.best) : 'Pas de temps'}</span>
                  {r.gap !== undefined && <span class="gp">{r.gap === 0 ? 'EN TÊTE' : fmtGap(r.gap)}</span>}
                </span>
                <span class="chev">{multi && <Icon name={expanded ? 'up' : 'down'} size={20} />}</span>
              </button>
              {expanded && (
                <ul class="runs">
                  {r.runs.map((run, i) => (
                    <li key={i} class={run.time === r.best ? 'best' : ''}>
                      <div class="run-main">
                        <span>Passage {i + 1}</span>
                        {run.time === r.best && r.runs.length > 1 && <span class="badge">MEILLEUR</span>}
                        <span class="mono">{fmtDuration(run.time)}</span>
                      </div>
                      {run.splits.length > 0 && (
                        <div class="run-splits mono">
                          {run.splits.map((sp, j) => <span key={j}>INT{j + 1} {fmtDuration(sp)}</span>)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {info && (
        <SessionInfo
          title={session.title}
          comment={session.comment}
          onClose={() => setInfo(false)}
          onSave={async (v) => {
            const patch = { title: v.title || undefined, comment: v.comment || undefined }
            if (store) store.setMeta(patch)
            else await onEditMeta?.(patch)
            setInfo(false)
          }}
        />
      )}

      {log && store && <TapLog store={store} session={session} onClose={() => setLog(false)} />}

      <footer class="bottom bar">
        {msg && <p class="toast-msg" style={{ margin: 0 }}>{msg}</p>}
        <div class="export">
          <button class="btn primary" onClick={() => shareWhatsApp(session)}><Icon name="chat" size={22} />WhatsApp</button>
          <button class="btn primary" onClick={excel}><Icon name="sheet" size={22} />Excel</button>
        </div>
        {store && <button class="btn outline" onClick={store.reset}>Nouvelle séance</button>}
      </footer>
    </div>
  )
}
