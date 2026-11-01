import { useEffect, useState } from 'preact/hooks'
import type { Kind, Tap } from '../core/model'
import type { AthleteResult } from '../core/results'
import { fmtClock, fmtDuration } from '../core/format'
import { Icon } from './Icon'

interface Props {
  tap: Tap
  total: number
  results: AthleteResult[]
  onCapture: (e: PointerEvent) => void
  onAssign: (athleteId: string, kind: Kind) => void
  onMass: () => void
  onVoid: () => void
  onLater: () => void
}

export function AssignSheet({ tap, total, results, onCapture, onAssign, onMass, onVoid, onLater }: Props) {
  // null = automatique : arrivée si l'athlète est en course, sinon départ.
  const [kind, setKind] = useState<Kind | null>(null)
  const [pressed, setPressed] = useState(false)
  useEffect(() => setKind(null), [tap.id])

  const isRunning = (r: AthleteResult) => r.openStart !== undefined && r.openStart <= tap.t
  const idle = results.filter((r) => !isRunning(r)).length
  const toggle = (k: Kind) => setKind((cur) => (cur === k ? null : k))
  const hint = kind === 'finish' ? 'Seuls les athlètes en course' : kind === 'start' ? 'Seuls les athlètes pas partis' : 'Auto : arrivée si en course'

  return (
    <section class="sheet" aria-label="Attribuer le tap">
      <div class="handle" aria-hidden="true" />
      <div class="sheet-head">
        <div>
          <span class="label">Tap à{total > 1 ? ` · 1 / ${total}` : ''}</span>
          <span class="mono clock">{fmtClock(tap.t)}</span>
        </div>
        <button
          class={`mini-tap ${pressed ? 'pressed' : ''}`}
          aria-label="Nouveau TAP"
          onPointerDown={(e) => { setPressed(true); onCapture(e) }}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          TAP
        </button>
      </div>

      <div class="segment" role="group">
        <button aria-pressed={kind === 'start'} class={kind === 'start' ? 'on' : ''} onClick={() => toggle('start')}>Départ</button>
        <button aria-pressed={kind === 'finish'} class={kind === 'finish' ? 'on' : ''} onClick={() => toggle('finish')}>Arrivée</button>
      </div>

      <div class="qui">
        <strong>Qui ?</strong>
        <span>{hint}</span>
      </div>

      <div class="grid">
        {results.map((r) => {
          const run = isRunning(r)
          const k: Kind = kind ?? (run ? 'finish' : 'start')
          const disabled = kind !== null && (kind === 'finish') !== run
          return (
            <button key={r.athlete.id} class={`athlete ${run ? 'running' : ''}`} disabled={disabled} onClick={() => onAssign(r.athlete.id, k)}>
              <span class="row"><span class="nm">{r.athlete.name}</span>{run && <span class="d" />}</span>
              <span class="st">{run ? `En course ${fmtDuration(tap.t - r.openStart!)}` : 'Pas parti'}</span>
            </button>
          )
        })}
      </div>

      <div class="sheet-actions">
        {idle > 1 && kind !== 'finish' && (
          <button class="btn outline full" onClick={onMass}>Départ groupé · {idle} athlètes</button>
        )}
        <button class="btn outline" onClick={onLater}>Plus tard</button>
        <button class="btn outline" onClick={onVoid}><Icon name="undo" size={20} />Annuler ce tap</button>
      </div>
    </section>
  )
}
