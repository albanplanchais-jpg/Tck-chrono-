import { useEffect, useMemo, useState } from 'preact/hooks'
import { KIND_LABEL, type Kind, type Session, type Tap } from '../core/model'
import { autoKind, stateAt, type AthleteResult } from '../core/results'
import { fmtClock, fmtDuration } from '../core/format'
import { Icon } from './Icon'

export interface Assignment { athleteId: string; kind: Kind }

interface Props {
  session: Session
  tap: Tap
  /** 'new' = tap à attribuer ; 'edit' = réattribuer un tap existant. */
  mode: 'new' | 'edit'
  total?: number
  onCapture?: (e: PointerEvent) => void
  onAssign: (items: Assignment[]) => void
  onVoid: () => void
  onClose: () => void
}

const SHORT: Record<Kind, string> = { start: 'DÉP', split: 'INT', finish: 'ARR' }

export function AssignSheet({ session, tap, mode, total = 1, onCapture, onAssign, onVoid, onClose }: Props) {
  const splits = session.splits ?? 0
  // null = automatique : départ si pas parti, sinon inter (si prévu) puis arrivée.
  const [kind, setKind] = useState<Kind | null>(mode === 'edit' ? tap.kind ?? null : null)
  const [multi, setMulti] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    setKind(mode === 'edit' ? tap.kind ?? null : null)
    setMulti(false)
    setPicked([])
  }, [tap.id])

  const state = useMemo(() => stateAt(session, tap), [session, tap])
  const kindFor = (r: AthleteResult): Kind => kind ?? autoKind(r, splits)
  const isRunning = (r: AthleteResult) => r.openStart !== undefined
  const allowed = (r: AthleteResult) => kind === null || (kind === 'start') !== isRunning(r)
  const idle = state.filter((r) => !isRunning(r))

  const kinds: Kind[] = splits > 0 ? ['start', 'split', 'finish'] : ['start', 'finish']
  const toggleKind = (k: Kind) => {
    setKind((cur) => (cur === k ? null : k))
    setPicked([])
  }

  const pick = (r: AthleteResult) => {
    if (!multi) return onAssign([{ athleteId: r.athlete.id, kind: kindFor(r) }])
    setPicked((p) => (p.includes(r.athlete.id) ? p.filter((x) => x !== r.athlete.id) : [...p, r.athlete.id]))
  }
  const confirmMulti = () =>
    onAssign(picked.map((id) => ({ athleteId: id, kind: kindFor(state.find((r) => r.athlete.id === id)!) })))

  const hint =
    kind === 'start' ? 'Athlètes pas partis' : kind ? 'Athlètes en course' : multi ? 'Touchez chaque athlète' : 'Auto selon la course'

  return (
    <section class="sheet" aria-label={mode === 'edit' ? 'Modifier le tap' : 'Attribuer le tap'}>
      <div class="handle" aria-hidden="true" />
      <div class="sheet-head">
        <div>
          <span class="label">
            {mode === 'edit' ? 'Modifier le tap' : 'Tap à'}
            {total > 1 ? ` · 1 / ${total}` : ''}
          </span>
          <span class="mono clock">{fmtClock(tap.t)}</span>
        </div>
        {onCapture && (
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
        )}
      </div>

      <div class={`segment n${kinds.length}`} role="group">
        {kinds.map((k) => (
          <button key={k} aria-pressed={kind === k} class={kind === k ? 'on' : ''} onClick={() => toggleKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div class="qui">
        <strong>Qui ?</strong>
        <span>{hint}</span>
        <button class={`multi ${multi ? 'on' : ''}`} aria-pressed={multi} onClick={() => { setMulti(!multi); setPicked([]) }}>
          Groupé
        </button>
      </div>

      <div class={`grid ${state.length > 6 ? 'dense' : ''}`}>
        {state.map((r) => {
          const run = isRunning(r)
          const k = kindFor(r)
          const sel = picked.includes(r.athlete.id)
          const current = mode === 'edit' && tap.athleteId === r.athlete.id
          const elapsed = run ? fmtDuration(tap.t - r.openStart!) : ''
          const next = k === 'split' ? `INT${r.openSplits.length + 1}` : SHORT[k]
          return (
            <button
              key={r.athlete.id}
              class={`athlete ${run ? 'running' : ''} ${sel ? 'picked' : ''} ${current ? 'current' : ''}`}
              disabled={!allowed(r)}
              aria-pressed={multi ? sel : undefined}
              onClick={() => pick(r)}
            >
              <span class="row">
                <span class="nm">{r.athlete.name}</span>
                {multi ? <span class={`box ${sel ? 'on' : ''}`}>{sel && <Icon name="check" size={12} stroke={3.4} />}</span> : run && <span class="d" />}
              </span>
              <span class="st">{run ? `${elapsed} → ${next}` : current ? 'ACTUEL' : `${r.runs.length ? 'ARRIVÉ' : 'PAS PARTI'} → ${next}`}</span>
            </button>
          )
        })}
      </div>

      <div class="sheet-actions">
        {multi ? (
          <>
            {kind !== 'finish' && kind !== 'split' && idle.length > 1 && (
              <button class="btn outline" onClick={() => setPicked(idle.map((r) => r.athlete.id))}>Tous les pas partis</button>
            )}
            <button class="btn primary full" disabled={!picked.length} onClick={confirmMulti}>
              Valider · {picked.length} athlète{picked.length > 1 ? 's' : ''}
            </button>
          </>
        ) : (
          <>
            <button class="btn outline" onClick={onClose}>{mode === 'edit' ? 'Fermer' : 'Plus tard'}</button>
            <button class="btn outline" onClick={onVoid}>
              <Icon name="undo" size={20} />{mode === 'edit' ? 'Supprimer' : 'Annuler ce tap'}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
