import { useState } from 'preact/hooks'
import type { Athlete } from '../core/model'
import { label, moveWave, parseBib, sortByBib, startAlone, startWith, waves } from '../core/startOrder'
import { Icon } from './Icon'

interface Props {
  athletes: Athlete[]
  onChange: (list: Athlete[]) => void
  onRemove?: (id: string) => void
  /** Athlètes déjà partis : leur place ne compte plus, on les signale. */
  started?: Set<string>
}

/**
 * Ordre de départ : dossards, ordre du premier au dernier (▲▼ ou tri par dossard),
 * et vagues (« part avec… ») pour faire partir plusieurs athlètes ensemble.
 */
export function StartOrder({ athletes, onChange, onRemove, started }: Props) {
  const [pickFor, setPickFor] = useState<string | null>(null)
  const ws = waves(athletes)
  const setBib = (id: string, v: string) => onChange(athletes.map((a) => (a.id === id ? { ...a, bib: parseBib(v) } : a)))

  return (
    <div class="order">
      <div class="order-tools">
        <span class="label">{ws.length} départ{ws.length > 1 ? 's' : ''} · {athletes.length} athlète{athletes.length > 1 ? 's' : ''}</span>
        <button class="pill outline" onClick={() => onChange(sortByBib(athletes))} disabled={athletes.length < 2}>
          Trier par n°
        </button>
      </div>

      <ol class="waves">
        {ws.map((w, wi) => (
          <li key={w[0].id} class={`wave ${w.length > 1 ? 'grp' : ''}`}>
            <span class="slot mono" aria-label={`Départ ${wi + 1}`}>{wi + 1}</span>
            <ul>
              {w.map((a, ai) => (
                <li key={a.id} class={started?.has(a.id) ? 'gone' : ''}>
                  <input
                    class="bib mono"
                    inputMode="numeric"
                    placeholder="n°"
                    aria-label={`Dossard de ${a.name}`}
                    value={a.bib ?? ''}
                    onChange={(e) => setBib(a.id, (e.target as HTMLInputElement).value)}
                  />
                  <span class="nm">{a.name}</span>
                  {w.length > 1 ? (
                    <button class="mini" onClick={() => onChange(startAlone(athletes, a.id))} aria-label={`${a.name} part seul`}>Seul</button>
                  ) : (
                    <button class={`mini ${pickFor === a.id ? 'on' : ''}`} onClick={() => setPickFor(pickFor === a.id ? null : a.id)} disabled={athletes.length < 2}>
                      Part avec…
                    </button>
                  )}
                  {ai === 0 ? (
                    <span class="arrows">
                      <button onClick={() => onChange(moveWave(athletes, a.id, -1))} disabled={wi === 0} aria-label="Partir plus tôt"><Icon name="up" size={16} stroke={2.8} /></button>
                      <button onClick={() => onChange(moveWave(athletes, a.id, 1))} disabled={wi === ws.length - 1} aria-label="Partir plus tard"><Icon name="down" size={16} stroke={2.8} /></button>
                    </span>
                  ) : (
                    <span class="arrows" />
                  )}
                  {onRemove && (
                    <button class="rm" onClick={() => onRemove(a.id)} aria-label={`Retirer ${a.name}`}><Icon name="x" size={18} /></button>
                  )}
                </li>
              ))}
            </ul>
            {pickFor && w.some((a) => a.id === pickFor) && (
              <div class="pick">
                <span class="label">{athletes.find((a) => a.id === pickFor)?.name} part avec :</span>
                <div class="chips">
                  {athletes
                    .filter((a) => a.id !== pickFor)
                    .map((a) => (
                      <button key={a.id} class="chip" onClick={() => { onChange(startWith(athletes, pickFor, a.id)); setPickFor(null) }}>
                        {label(a)}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
