import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Kind, Session, Tap } from '../core/model'
import { computeAll, pendingTaps } from '../core/results'
import { fmtClock, fmtDuration, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { useWakeLock } from '../device/wakeLock'
import { useNow } from '../device/useNow'
import { tapFeedback } from '../device/feedback'
import { AssignSheet } from '../components/AssignSheet'
import { ConfirmModal } from '../components/ConfirmModal'
import { Icon } from '../components/Icon'

interface Toast { name: string; kind: string; t: number; extra?: string; undo: Tap[] }

const KIND = { start: 'DÉPART', finish: 'ARRIVÉE' } as const

export function Timer({ store, session }: { store: Store; session: Session }) {
  useWakeLock()
  const now = useNow()
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pressed, setPressed] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)

  const results = useMemo(() => computeAll(session), [session])
  const pending = useMemo(() => pendingTaps(session), [session])
  const running = results.filter((r) => r.openStart !== undefined).sort((a, b) => a.openStart! - b.openStart!)
  const current = pending[0]
  const nameOf = (id?: string) => session.athletes.find((a) => a.id === id)?.name ?? '?'
  const last = useMemo(
    () => session.taps.filter((t) => !t.voided && t.athleteId && t.kind).sort((a, b) => b.t - a.t)[0],
    [session]
  )

  useEffect(() => { if (!pending.length) setSheet(false) }, [pending.length])

  const flash = (t: Toast) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  /** Instant exact du contact du doigt (pas du relâchement). */
  const capture = (e: PointerEvent) => {
    e.preventDefault()
    store.addTap(performance.timeOrigin + e.timeStamp)
    tapFeedback()
    setSheet(true)
  }

  const onAssign = (tap: Tap, athleteId: string, kind: Kind) => {
    const r = results.find((x) => x.athlete.id === athleteId)!
    const extra = kind === 'finish' && r.openStart !== undefined ? fmtDuration(tap.t - r.openStart) : undefined
    flash({ name: r.athlete.name, kind: KIND[kind], t: tap.t, extra, undo: session.taps })
    store.assign(tap.id, athleteId, kind)
  }

  const onMass = (tap: Tap) => {
    const ids = results.filter((r) => r.openStart === undefined).map((r) => r.athlete.id)
    flash({ name: `${ids.length} athlètes`, kind: 'DÉPART', t: tap.t, undo: session.taps })
    store.massStart(tap.id, ids)
  }

  const passages = results.reduce((n, r) => n + r.runs.length, 0)

  return (
    <div class="screen timer">
      <header class="timer-head px">
        <span class="label">Séance · {fmtHM(session.createdAt)}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {pending.length > 0 && !sheet && (
            <button class="pill outline" onClick={() => setSheet(true)}>{pending.length} à attribuer</button>
          )}
          <span class="pill solid">{running.length} en course</span>
        </span>
      </header>

      <ul class="live" style={{ margin: '12px 16px 0' }}>
        {running.length === 0 && <li class="none">Personne en course</li>}
        {running.map((r) => (
          <li key={r.athlete.id}>
            <span class="who"><span class="dot" /><span>{r.athlete.name}</span></span>
            <span class="t">{fmtDuration(now - r.openStart!)}</span>
          </li>
        ))}
      </ul>

      <div class="tap-zone">
        <div class="tap-ring">
          <div>
            <button
              class={`tap ${pressed ? 'pressed' : ''}`}
              aria-label="TAP — capturer le temps"
              onPointerDown={(e) => { setPressed(true); capture(e) }}
              onPointerUp={() => setPressed(false)}
              onPointerCancel={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              TAP
            </button>
          </div>
        </div>
        {toast ? (
          <div class="confirm" role="status" style={{ alignSelf: 'stretch' }}>
            <span class="txt">
              <b>{toast.name} — {toast.kind}</b>
              <span class="mono">{toast.extra ?? fmtClock(toast.t)}</span>
            </span>
            <button class="undo" onClick={() => { store.restore(toast.undo); setToast(null); setSheet(true) }}>Annuler</button>
            <Icon name="check" />
          </div>
        ) : (
          <div class="last">
            {last ? `DERNIER · ${nameOf(last.athleteId)} — ${KIND[last.kind!]} · ${fmtClock(last.t)}` : 'Touchez TAP au départ ou à l\'arrivée'}
          </div>
        )}
      </div>

      <div class="foot">
        <button class="link" onClick={() => setConfirm(true)}>Terminer la séance</button>
      </div>

      {sheet && current && (
        <>
          <div class="scrim" onClick={() => setSheet(false)} />
          <AssignSheet
            tap={current}
            total={pending.length}
            results={results}
            onCapture={capture}
            onAssign={(a, k) => onAssign(current, a, k)}
            onMass={() => onMass(current)}
            onVoid={() => store.voidTap(current.id)}
            onLater={() => setSheet(false)}
          />
        </>
      )}

      {confirm && (
        <ConfirmModal
          athletes={session.athletes.length}
          running={running.length}
          passages={passages}
          onConfirm={() => { setConfirm(false); store.end() }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  )
}
