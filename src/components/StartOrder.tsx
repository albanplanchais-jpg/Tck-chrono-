import { useRef, useState } from 'preact/hooks'
import type { Athlete } from '../core/model'
import { label, moveWave, moveWaveTo, parseBib, sortByBib, startAlone, startWith, waves } from '../core/startOrder'
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
  // Glisser-déposer d'une vague (poignée ⋮⋮ à gauche).
  const [drag, setDrag] = useState<{ id: string; from: number; y0: number; dy: number; over: number } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  /** Place visée = nombre de vagues (hors celle déplacée) dont le milieu est au-dessus du doigt. */
  const overAt = (y: number, from: number) => {
    let n = 0
    ;(Array.from(listRef.current?.children ?? []) as HTMLElement[]).forEach((el, i) => {
      if (i === from) return
      const r = el.getBoundingClientRect()
      if (y > r.top + r.height / 2) n++
    })
    return n
  }
  /** Ligne de dépôt : avant l'élément d'origine k, ou après le dernier. */
  const dropClass = (wi: number) => {
    if (!drag || drag.over === drag.from) return ''
    const k = drag.over < drag.from ? drag.over : drag.over + 1
    if (k === wi) return 'drop-before'
    if (k >= ws.length && wi === ws.length - 1) return 'drop-after'
    return ''
  }
  const dragStart = (e: PointerEvent, id: string, from: number) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setPickFor(null)
    setDrag({ id, from, y0: e.clientY, dy: 0, over: from })
  }
  const dragMove = (e: PointerEvent) => drag && setDrag({ ...drag, dy: e.clientY - drag.y0, over: overAt(e.clientY, drag.from) })
  const dragEnd = () => {
    if (drag && drag.over !== drag.from) onChange(moveWaveTo(athletes, drag.id, drag.over))
    setDrag(null)
  }
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

      <ol class={`waves ${drag ? 'sorting' : ''}`} ref={listRef}>
        {ws.map((w, wi) => (
          <li
            key={w[0].id}
            class={`wave ${w.length > 1 ? 'grp' : ''} ${drag?.from === wi ? 'dragging' : ''} ${dropClass(wi)}`}
            style={drag?.from === wi ? { transform: `translateY(${drag.dy}px)` } : undefined}
          >
            <button
              class="grip"
              aria-label={`Déplacer le départ ${wi + 1} (glisser)`}
              onPointerDown={(e) => dragStart(e, w[0].id, wi)}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onPointerCancel={() => setDrag(null)}
            >
              <span class="slot mono">{wi + 1}</span>
              <Icon name="grip" size={16} stroke={3.2} />
            </button>
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
