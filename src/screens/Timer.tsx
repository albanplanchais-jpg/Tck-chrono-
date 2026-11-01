import { useMemo, useRef, useState } from 'preact/hooks'
import { KIND_LABEL, type Kind, type Session, type Tap } from '../core/model'
import { autoKind, computeAll, pendingTaps, type AthleteResult } from '../core/results'
import { fmtClock, fmtDuration, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { useWakeLock } from '../device/wakeLock'
import { useNow } from '../device/useNow'
import { tapFeedback } from '../device/feedback'
import { TapLog } from '../components/TapLog'
import { ConfirmModal } from '../components/ConfirmModal'
import { Icon } from '../components/Icon'

interface Toast { text: string; extra?: string; undo: Tap[] }

const SHORT: Record<Kind, string> = { start: 'DÉP', split: 'INT', finish: 'ARR' }

/** Instant exact d'un événement pointeur (contact du doigt). */
const eventTime = (e: Event) => performance.timeOrigin + e.timeStamp

export function Timer({ store, session }: { store: Store; session: Session }) {
  useWakeLock()
  const now = useNow()
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pressed, setPressed] = useState(false)
  const [log, setLog] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const downAt = useRef(0)

  const splits = session.splits ?? 0
  const kinds: Kind[] = splits > 0 ? ['start', 'split', 'finish'] : ['start', 'finish']
  const results = useMemo(() => computeAll(session), [session])
  const pending = useMemo(() => pendingTaps(session), [session])
  const running = results.filter((r) => r.openStart !== undefined)
  const idle = results.filter((r) => r.openStart === undefined)

  const flash = (t: Toast) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  /** Impulsion sur le logo : mise en attente jusqu'au choix sur une ligne. */
  const impulse = (e: PointerEvent) => {
    e.preventDefault()
    setPressed(true)
    store.addTap(eventTime(e))
    tapFeedback()
  }

  const canDo = (r: AthleteResult, k: Kind) =>
    k === 'start'
      ? r.openStart === undefined
      : r.openStart !== undefined && (k !== 'split' || r.openSplits.length < splits)

  /**
   * Bouton d'une ligne : prend l'impulsion en attente la plus ancienne,
   * sinon enregistre l'instant où le doigt a touché le bouton.
   */
  const record = (r: AthleteResult, k: Kind) => {
    if (!canDo(r, k)) return
    const before = session.taps
    const tap = pending[0]
    const t = tap ? tap.t : downAt.current || Date.now()
    if (tap) store.assignMany(tap.id, [{ athleteId: r.athlete.id, kind: k }])
    else {
      store.addAssigned(t, r.athlete.id, k)
      tapFeedback()
    }
    const label = k === 'split' ? `INTER ${r.openSplits.length + 1}` : KIND_LABEL[k]
    const extra = k !== 'start' && r.openStart !== undefined ? fmtDuration(t - r.openStart) : fmtClock(t)
    flash({ text: `${r.athlete.name} — ${label}`, extra, undo: before })
  }

  const massStart = () => {
    const tap = pending[0]
    if (!tap || idle.length < 2) return
    const before = session.taps
    store.assignMany(tap.id, idle.map((r) => ({ athleteId: r.athlete.id, kind: 'start' as Kind })))
    flash({ text: `${idle.length} athlètes — DÉPART`, extra: fmtClock(tap.t), undo: before })
  }

  const passages = results.reduce((n, r) => n + r.runs.length, 0)

  return (
    <div class="screen timer board">
      <header class="timer-head px">
        <span class="label">Séance · {fmtHM(session.createdAt)}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button class="pill outline" onClick={() => setLog(true)}>Journal</button>
          <button class="pill solid" onClick={() => setConfirm(true)}>Terminer</button>
        </span>
      </header>

      <div class="status">
        {pending.length > 0 ? (
          <div class="confirm waiting" role="status">
            <span class="txt">
              <b>{pending.length} impulsion{pending.length > 1 ? 's' : ''} en attente</b>
              <span class="mono">{fmtClock(pending[0].t)} → choisir la ligne</span>
            </span>
            {idle.length > 1 && running.length === 0 ? (
              <button class="q" onClick={massStart}>Tous partent</button>
            ) : (
              <button class="q" onClick={() => store.voidTap(pending[0].id)} aria-label="Supprimer l'impulsion">
                <Icon name="x" size={20} />
              </button>
            )}
          </div>
        ) : toast ? (
          <div class="confirm" role="status">
            <span class="txt">
              <b>{toast.text}</b>
              <span class="mono">{toast.extra}</span>
            </span>
            <button class="undo" onClick={() => { store.restore(toast.undo); setToast(null) }}>Annuler</button>
            <Icon name="check" />
          </div>
        ) : (
          <div class="last">TOUCHEZ LE LOGO, PUIS LE BOUTON DE L'ATHLÈTE</div>
        )}
      </div>

      <div class={`rows-head px n${kinds.length}`}>
        <span class="label">Athlète{running.length ? ` · ${running.length} ●` : ''}</span>
        <span class="label">Temps</span>
        {kinds.map((k) => <span key={k} class="label c">{SHORT[k]}</span>)}
      </div>

      <ul class={`rows n${kinds.length} ${results.length > 10 ? 'dense' : ''} ${pending.length ? 'armed' : ''}`}>
        {results.map((r) => {
          const run = r.openStart !== undefined
          const next = autoKind(r, splits)
          const lastRun = r.runs[r.runs.length - 1]
          return (
            <li key={r.athlete.id} class={run ? 'running' : ''}>
              <span class="nm">
                {run && <span class="dot" />}
                <span class="n">{r.athlete.name}</span>
              </span>
              <span class="tm mono">
                {run ? fmtDuration(now - r.openStart!) : lastRun ? fmtDuration(lastRun.time) : '—'}
                {run && r.openSplits.length > 0 && (
                  <small>INT{r.openSplits.length} {fmtDuration(r.openSplits[r.openSplits.length - 1])}</small>
                )}
                {!run && r.runs.length > 0 && <small>{r.runs.length > 1 ? `${r.runs.length} passages` : 'arrivé'}</small>}
              </span>
              {kinds.map((k) => (
                <button
                  key={k}
                  class={`act ${k === next ? 'next' : ''}`}
                  disabled={!canDo(r, k)}
                  aria-label={`${KIND_LABEL[k]} ${r.athlete.name}`}
                  onPointerDown={(e) => { downAt.current = eventTime(e) }}
                  onClick={() => record(r, k)}
                >
                  {SHORT[k]}
                </button>
              ))}
            </li>
          )
        })}
      </ul>

      {/* Zone fixe : le logo est toujours au même endroit et toujours cliquable. */}
      <div class="tap-dock">
        <div class="ring">
          <button
            class={`tap logo ${pressed ? 'pressed' : ''}`}
            aria-label="Impulsion — capturer le temps"
            onPointerDown={impulse}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img src="/logo.png" alt="" draggable={false} />
            {pending.length > 0 && <span class="tap-count">{pending.length}</span>}
          </button>
        </div>
      </div>

      {log && <TapLog store={store} session={session} onClose={() => setLog(false)} />}

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
