import { useMemo, useState } from 'preact/hooks'
import type { Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDay, fmtDuration, fmtGap, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { shareResults } from '../device/share'
import { Icon } from '../components/Icon'

export function Results({ store, session }: { store: Store; session: Session }) {
  const rows = useMemo(() => ranking(session), [session])
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const share = async () => {
    const r = await shareResults(session)
    if (r === 'shared') return
    setMsg(r === 'copied' ? 'Résultats copiés dans le presse-papier' : 'Partage impossible sur cet appareil')
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div class="screen results">
      <header class="px" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span class="label">Séance terminée</span>
          <h1>Résultats</h1>
          <span class="res-sub">{fmtDay(session.createdAt)} · {fmtHM(session.createdAt)} – {fmtHM(session.endedAt!)}</span>
        </div>
        <button class="link" style={{ padding: '0 0 0 12px', fontSize: 15, color: 'var(--g4)' }} onClick={store.resume}>Reprendre</button>
      </header>

      <div class="cols label" style={{ fontSize: 12 }}>
        <span>Rang</span><span>Athlète</span><span>Meilleur</span>
      </div>

      <ol class="scroll ranking">
        {rows.map((r) => {
          const expanded = open === r.athlete.id
          const multi = r.runs.length > 1
          return (
            <li key={r.athlete.id} class={r.rank === 1 ? 'first' : ''}>
              <button
                class={`rank-row ${r.best === undefined ? 'nt' : ''}`}
                aria-expanded={multi ? expanded : undefined}
                onClick={() => multi && setOpen(expanded ? null : r.athlete.id)}
              >
                <span class="rk">{r.rank ?? '–'}</span>
                <span style={{ minWidth: 0 }}>
                  <span class="nm">{r.athlete.name}</span>
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
                      <span>Passage {i + 1}</span>
                      {run.time === r.best && <span class="badge">MEILLEUR</span>}
                      <span class="mono">{fmtDuration(run.time)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      <footer class="bottom bar">
        {msg && <p class="toast-msg" style={{ margin: 0 }}>{msg}</p>}
        <button class="btn primary" onClick={share}><Icon name="share" size={22} />Partager</button>
        <button class="btn outline" onClick={store.reset}>Nouvelle séance</button>
      </footer>
    </div>
  )
}
