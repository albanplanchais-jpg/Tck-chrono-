import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { KIND_LABEL, type Kind, type Session, type Tap } from '../core/model'
import { computeAll, pendingTaps, stateAt } from '../core/results'
import { fmtClock, fmtDuration, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { useWakeLock } from '../device/wakeLock'
import { useNow } from '../device/useNow'
import { tapFeedback } from '../device/feedback'
import { AssignSheet, type Assignment } from '../components/AssignSheet'
import { TapLog } from '../components/TapLog'
import { ConfirmModal } from '../components/ConfirmModal'
import { Icon } from '../components/Icon'

interface Toast { name: string; kind: string; t: number; extra?: string; undo: Tap[] }


export function Timer({ store, session }: { store: Store; session: Session }) {
  useWakeLock()
  const now = useNow()
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pressed, setPressed] = useState(false)
  const [log, setLog] = useState(false)
  // Mode groupé : on choisit inter / arrivée, on tape à chaque passage, on attribue ensuite dans l'ordre.
  // Activé d'office ; le type suit la course (départ → inter → arrivée) sauf choix manuel.
  const [group, setGroup] = useState(true)
  const [manualKind, setManualKind] = useState<Kind | null>(null)
  const splits = session.splits ?? 0
  const toastTimer = useRef<number | undefined>(undefined)

  const results = useMemo(() => computeAll(session), [session])
  const pending = useMemo(() => pendingTaps(session), [session])
  const running = results.filter((r) => r.openStart !== undefined).sort((a, b) => a.openStart! - b.openStart!)
  const current = pending[0]
  const autoGroupKind: Kind = !running.length
    ? 'start'
    : splits > 0 && running.some((r) => r.openSplits.length < splits) ? 'split' : 'finish'
  const groupKind = manualKind ?? autoGroupKind
  const groupKinds: Kind[] = splits > 0 ? ['start', 'split', 'finish'] : ['start', 'finish']
  const nameOf = (id?: string) => session.athletes.find((a) => a.id === id)?.name ?? '?'
  const last = useMemo(
    () => session.taps.filter((t) => !t.voided && t.athleteId && t.kind).sort((a, b) => b.t - a.t)[0],
    [session]
  )

  useEffect(() => {
    if (!pending.length) {
      setSheet(false)
      setManualKind(null) // série attribuée : on repasse en automatique
    }
  }, [pending.length])

  const flash = (t: Toast) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  /** Instant exact du contact du doigt (pas du relâchement). */
  const capture = (e: PointerEvent) => {
    e.preventDefault()
    const t = performance.timeOrigin + e.timeStamp
    tapFeedback()
    // Le bouton ne bouge jamais : chaque tap est mis en file, on attribue dans l'ordre.
    store.addTap(t, group ? groupKind : undefined)
    if (!group) setSheet(true)
  }

  const onAssign = (tap: Tap, items: Assignment[]) => {
    const before = session.taps
    const st = stateAt(session, tap)
    const first = st.find((x) => x.athlete.id === items[0].athleteId)!
    const k = items[0].kind
    const label = k === 'split' ? `INTER ${first.openSplits.length + 1}` : KIND_LABEL[k]
    const extra = items.length === 1 && k !== 'start' && first.openStart !== undefined ? fmtDuration(tap.t - first.openStart) : undefined
    const name = items.length > 1 ? `${items.length} athlètes` : first.athlete.name
    flash({ name, kind: items.length > 1 && items.some((i) => i.kind !== k) ? 'GROUPÉ' : label, t: tap.t, extra, undo: before })
    store.assignMany(tap.id, items)
  }

  const passages = results.reduce((n, r) => n + r.runs.length, 0)

  const panel = sheet && current

  return (
    <div class="screen timer">
      <header class="timer-head px">
        <span class="label">Séance · {fmtHM(session.createdAt)}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button class="pill outline" onClick={() => setLog(true)}>Journal</button>
          <span class="pill solid">{running.length} en course</span>
        </span>
      </header>

      <div class="main">
        {group && !panel && (
          <div class="group-bar px">
            <span class="label white">{manualKind ? 'Manuel' : 'Auto'}</span>
            <div class={`seg-sm kinds n${groupKinds.length}`} role="group" aria-label="Type des prochains taps">
              {groupKinds.map((k) => (
                <button
                  key={k}
                  class={groupKind === k ? 'on' : ''}
                  aria-pressed={groupKind === k}
                  onClick={() => setManualKind(manualKind === k ? null : k)}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {panel ? (
          <AssignSheet
            inline
            session={session}
            tap={current}
            mode="new"
            total={pending.length}
            onAssign={(items) => onAssign(current, items)}
            onVoid={() => store.voidTap(current.id)}
            onClose={() => setSheet(false)}
          />
        ) : (
          <ul class={`live ${running.length > 4 ? 'compact' : ''}`}>
            {running.length === 0 && <li class="none">Personne en course</li>}
            {running.map((r) => (
              <li key={r.athlete.id}>
                <span class="who">
                  <span class="dot" />
                  <span class="nm">
                    {r.athlete.name}
                    {r.openSplits.length > 0 && (
                      <small class="mono">INT{r.openSplits.length} {fmtDuration(r.openSplits[r.openSplits.length - 1])}</small>
                    )}
                  </span>
                </span>
                <span class="t">{fmtDuration(now - r.openStart!)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="status">
        {!panel && pending.length > 0 ? (
          <button class="confirm assign-batch" onClick={() => setSheet(true)}>
            <span class="txt">
              <b>{pending.length} passage{pending.length > 1 ? 's' : ''} à attribuer</b>
              <span class="mono">dernier · {fmtClock(pending[pending.length - 1].t)}</span>
            </span>
            <span class="go">Attribuer</span>
          </button>
        ) : toast ? (
          <div class="confirm" role="status">
            <span class="txt">
              <b>{toast.name} — {toast.kind}</b>
              <span class="mono">{toast.extra ?? fmtClock(toast.t)}</span>
            </span>
            <button class="undo" onClick={() => { store.restore(toast.undo); setToast(null); setSheet(true) }}>Annuler</button>
            <Icon name="check" />
          </div>
        ) : (
          <div class="last">
            {group
              ? 'TAPEZ À CHAQUE PASSAGE · ATTRIBUEZ ENSUITE'
              : last
                ? `DERNIER · ${nameOf(last.athleteId)} — ${KIND_LABEL[last.kind!]} · ${fmtClock(last.t)}`
                : "Touchez TAP au départ ou à l'arrivée"}
          </div>
        )}
      </div>

      {/* Zone fixe : le TAP est toujours au même endroit et toujours cliquable. */}
      <div class="tap-dock">
        <div class="ring">
          <button
            class={`tap logo ${pressed ? 'pressed' : ''}`}
            aria-label="TAP — capturer le temps"
            onPointerDown={(e) => { setPressed(true); capture(e) }}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img src="/logo.png" alt="" draggable={false} />
            {group && <small class="tap-kind">{KIND_LABEL[groupKind]}</small>}
            {pending.length > 0 && <span class="tap-count">{pending.length}</span>}
          </button>
        </div>
      </div>

      <div class="foot split">
        <button
          class={`grp-toggle ${group ? 'on' : ''}`}
          aria-pressed={group}
          onClick={() => { setGroup(!group); setManualKind(null) }}
        >
          <span class="sw" />Groupé
        </button>
        <button class="link" onClick={() => setConfirm(true)}>Terminer</button>
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
