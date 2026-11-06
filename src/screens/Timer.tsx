import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { KIND_LABEL, type Kind, type Session, type Tap } from '../core/model'
import { autoKind, computeAll, pendingTaps, type AthleteResult } from '../core/results'
import { fmtClock, fmtDuration } from '../core/format'
import type { Store } from '../store/useSession'
import { useWakeLock } from '../device/wakeLock'
import { useNow } from '../device/useNow'
import { tapFeedback } from '../device/feedback'
import { TapLog } from '../components/TapLog'
import { AthleteFix } from '../components/AthleteFix'
import { StartOrder } from '../components/StartOrder'
import { waveOf, waves } from '../core/startOrder'
import { schedule } from '../core/modes'
import { ConfirmModal } from '../components/ConfirmModal'
import { Icon } from '../components/Icon'
import { ShareModal } from '../components/ShareModal'
import { SessionInfo } from '../components/SessionInfo'
import { GeneralClock } from '../components/GeneralClock'
import type { SyncState } from '../cloud/sync'
import { serverNow, toServer } from '../cloud/clock'

interface Toast { text: string; extra?: string; undo: Tap[] }

/** Durée de la séance : 4:05 ou 1:02:03. */
const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

/** Temps avant un départ programmé : « 7 s », « 1:15 ». */
const waitLabel = (ms: number) => {
  const sec = Math.ceil(ms / 1000)
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

const SHORT: Record<Kind, string> = { start: 'DÉP', split: 'INT', finish: 'ARR' }

/** Instant exact d'un événement pointeur (contact du doigt). */
const eventTime = (e: Event) => toServer(performance.timeOrigin + e.timeStamp)

const SYNC_LABEL: Record<SyncState, string> = {
  off: '',
  ok: 'En ligne',
  pending: 'Envoi…',
  offline: 'Hors ligne',
  error: 'Erreur de synchro'
}

export function Timer({ store, session, sync = 'off' }: { store: Store; session: Session; sync?: SyncState }) {
  useWakeLock()
  const now = useNow()
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pressed, setPressed] = useState(false)
  const [log, setLog] = useState(false)
  const [fixId, setFixId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const downAt = useRef(0)

  const splits = session.splits ?? 0
  const kinds: Kind[] = splits > 0 ? ['start', 'split', 'finish'] : ['start', 'finish']
  const results = useMemo(() => computeAll(session), [session])
  const pending = useMemo(() => pendingTaps(session), [session])
  // Poursuite : les départs sont programmés ; un athlète pas encore parti n'est pas « en course ».
  const started = (r: AthleteResult) => r.openStart !== undefined && r.openStart <= now
  const running = results.filter(started)
  const idle = results.filter((r) => r.openStart === undefined)
  // Mass start / poursuite : avant le top départ, le logo donne le départ.
  const special = session.mode === 'mass' || session.mode === 'pursuit'
  const awaitingTop = special && session.general?.start === undefined
  const plan = useMemo(
    () =>
      session.mode === 'pursuit' && session.general?.start !== undefined
        ? schedule(session, session.general.start).map((x) => {
            const a = session.athletes.find((y) => y.id === x.athleteId)!
            return { t: x.t, label: a.bib !== undefined ? `${a.bib} ${a.name}` : a.name }
          })
        : undefined,
    [session.mode, session.general?.start, session.athletes]
  )

  const flash = (t: Toast) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  /** Impulsion sur le logo : mise en attente jusqu'au choix sur une ligne. */
  const impulse = (e: PointerEvent) => {
    e.preventDefault()
    setPressed(true)
    tapFeedback()
    if (awaitingTop) return topStart(eventTime(e))
    store.addTap(eventTime(e))
  }

  /** Top départ : mass start (tout le monde) ou poursuite (chacun à son écart, programmé). */
  const topStart = (t0: number) => {
    const before = session.taps
    const plan = schedule(session, t0)
    store.addAssignedMany(plan.map((x) => ({ ...x, kind: 'start' as Kind })))
    store.setMeta({ general: { ...session.general, start: t0 } })
    const first = session.athletes.find((a) => a.id === plan[0]?.athleteId)
    flash({
      text: session.mode === 'mass' ? `DÉPART — ${plan.length} athlètes` : `Top départ · ${first?.name ?? ''} part`,
      extra: session.mode === 'mass' ? fmtClock(t0) : `${plan.length} départs programmés`,
      undo: before
    })
  }

  const canDo = (r: AthleteResult, k: Kind) =>
    k === 'start'
      ? r.openStart === undefined
      : started(r) && (k !== 'split' || r.openSplits.length < splits)

  /**
   * Bouton d'une ligne : prend l'impulsion en attente la plus ancienne,
   * sinon enregistre l'instant où le doigt a touché le bouton.
   */
  const record = (r: AthleteResult, k: Kind) => {
    if (!canDo(r, k)) return
    const before = session.taps
    const tap = pending[0]
    const t = tap ? tap.t : downAt.current || serverNow()
    // Départ : toute la vague de l'athlète (ceux qui ne sont pas déjà partis) part avec lui.
    const mates =
      k === 'start'
        ? waveOf(session.athletes, r.athlete.id)
            .map((a) => results.find((x) => x.athlete.id === a.id)!)
            .filter((x) => x && canDo(x, 'start'))
        : [r]
    const items = mates.map((x) => ({ athleteId: x.athlete.id, kind: k }))
    // Le chrono général démarre au premier départ.
    if (k === 'start' && session.general?.start === undefined) store.setMeta({ general: { ...session.general, start: t } })
    if (tap) store.assignMany(tap.id, items)
    else {
      items.forEach((it) => store.addAssigned(t, it.athleteId, k))
      tapFeedback()
    }
    const label = k === 'split' ? `INTER ${r.openSplits.length + 1}` : KIND_LABEL[k]
    const extra = k !== 'start' && r.openStart !== undefined ? fmtDuration(t - r.openStart) : fmtClock(t)
    flash({ text: `${mates.map((x) => x.athlete.name).join(' + ')} — ${label}`, extra, undo: before })
  }

  const massStart = () => {
    const tap = pending[0]
    if (!tap || idle.length < 2) return
    const before = session.taps
    store.assignMany(tap.id, idle.map((r) => ({ athleteId: r.athlete.id, kind: 'start' as Kind })))
    if (session.general?.start === undefined) store.setMeta({ general: { ...session.general, start: tap.t } })
    flash({ text: `${idle.length} athlètes — DÉPART`, extra: fmtClock(tap.t), undo: before })
  }

  // Annonce des athlètes qui viennent de rejoindre par le lien.
  const seen = useRef(session.athletes.length)
  useEffect(() => {
    const n = session.athletes.length
    if (n > seen.current) {
      const fresh = session.athletes.slice(seen.current).map((a) => a.name)
      flash({ text: `${fresh.join(', ')} ${fresh.length > 1 ? 'ont' : 'a'} rejoint`, extra: 'via le lien', undo: session.taps })
    }
    seen.current = n
  }, [session.athletes.length])

  // Vagues de départ : la prochaine vague (personne n'est encore parti) est signalée.
  const touched = useMemo(() => new Set(session.taps.filter((t) => !t.voided && t.athleteId).map((t) => t.athleteId!)), [session.taps])
  const nextWave = useMemo(
    () => new Set((waves(session.athletes).find((w) => w.every((a) => !touched.has(a.id))) ?? []).map((a) => a.id)),
    [session.athletes, touched]
  )

  const nextLabel = useMemo(
    () => session.athletes.filter((a) => nextWave.has(a.id)).map((a) => (a.bib !== undefined ? `${a.bib} ${a.name}` : a.name)).join(' + '),
    [session.athletes, nextWave]
  )

  const passages = results.reduce((n, r) => n + r.runs.length, 0)

  return (
    <div class={`screen timer board ${results.length > 10 ? 'crowded' : ''}`}>
      <header class="t-head px">
        <div class={`live-chip ${sync}`} title={SYNC_LABEL[sync] || 'Séance en cours'}>
          <span class="pulse" aria-hidden="true" />
          <span class="live-txt">
            <small>{sync === 'offline' ? 'Hors ligne' : sync === 'error' ? 'Synchro' : 'En direct'}</small>
            <b class="mono">{fmtElapsed(now - session.createdAt)}</b>
          </span>
        </div>
        <nav class="t-actions">
          <button class="icon-btn" onClick={() => setInfoOpen(true)} aria-label="Nom et commentaire de la séance">
            <Icon name="edit" size={18} stroke={2.2} />
          </button>
          {session.code && (
            <button class="icon-btn" onClick={() => setShareOpen(true)} aria-label="Partager la séance">
              <Icon name="link" size={20} stroke={2.2} />
            </button>
          )}
          <button class="icon-btn" onClick={() => setLog(true)} aria-label="Journal des temps">
            <Icon name="list" size={20} stroke={2.2} />
          </button>
          <button class="end-btn" onClick={() => setConfirm(true)}>
            <Icon name="flag" size={16} stroke={2.4} />Terminer
          </button>
        </nav>
      </header>

      <GeneralClock
        general={session.general}
        now={now}
        next={nextLabel}
        plan={plan}
        fixed={special}
        onChange={(general) => store.setMeta({ general })}
      />

      <div class="status">
        {pending.length > 0 ? (
          <div class="confirm waiting" role="status">
            <span class="txt">
              <b>{pending.length} impulsion{pending.length > 1 ? 's' : ''} en attente</b>
              <span class="mono">{fmtClock(pending[0].t)} → choisir la ligne</span>
            </span>
            {!special && idle.length > 1 && running.length === 0 ? (
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
          awaitingTop ? (
            <p class="hint-line top">
              <b>{session.mode === 'mass' ? 'Mass start' : 'Poursuite'}</b> · touchez le logo pour le {session.mode === 'mass' ? 'départ de tous' : 'top départ'}
              <span>
                {session.mode === 'mass'
                  ? `${session.athletes.length} athlètes partent ensemble`
                  : `${session.athletes[0]?.name ?? ''} part en premier · départs automatiques`}
              </span>
            </p>
          ) : (
            <p class="hint-line">
              Touchez le <b>logo</b>, puis le bouton de l'athlète.
              <span>Un nom pour corriger.</span>
            </p>
          )
        )}
      </div>

      <div class={`rows-head px n${kinds.length}`}>
        <button class="order-btn" onClick={() => setOrderOpen(true)} aria-label="Modifier l'ordre de départ">
          <Icon name="edit" size={13} stroke={2.4} />Ordre
        </button>
        <span class="label">Temps</span>
        {kinds.map((k) => <span key={k} class="label c">{SHORT[k]}</span>)}
      </div>

      <ul class={`rows n${kinds.length} ${results.length > 10 ? 'dense' : ''} ${pending.length ? 'armed' : ''}`}>
        {results.map((r) => {
          const run = started(r)
          const waiting = r.openStart !== undefined && r.openStart > now
          // Mass start / poursuite : avant le top, c'est le logo qui donne le départ (pas les DÉP).
          const next = awaitingTop ? null : autoKind(r, splits)
          const lastRun = r.runs[r.runs.length - 1]
          return (
            <li key={r.athlete.id} class={`${run ? 'running' : ''} ${r.athlete.withPrev ? 'with-prev' : ''} ${nextWave.has(r.athlete.id) ? 'next-wave' : ''}`}>
              <button class="nm" onClick={() => setFixId(r.athlete.id)} aria-label={`Corriger ${r.athlete.name}`}>
                {run && <span class="dot" />}
                {nextWave.has(r.athlete.id) && !run && <span class="next-mark" aria-label="Prochain départ">▸</span>}
                {r.athlete.bib !== undefined && <span class="bibn mono">{r.athlete.bib}</span>}
                <span class="n">{r.athlete.name}</span>
              </button>
              <span class="tm mono">
                {waiting ? <span class="wait">dans {waitLabel(r.openStart! - now)}</span> : run ? fmtDuration(now - r.openStart!) : lastRun ? fmtDuration(lastRun.time) : '—'}
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

      {results.length === 0 && session.code && (
        <button class="empty-join" onClick={() => setShareOpen(true)}>
          <b>Aucun athlète pour l'instant</b>
          <span>Touchez ici pour afficher le QR code : les athlètes s'inscrivent et apparaissent automatiquement.</span>
        </button>
      )}

      {shareOpen && session.code && <ShareModal code={session.code} sessionId={session.id} splits={splits} onClose={() => setShareOpen(false)} onEnableSplits={() => store.setMeta({ splits: 1 })} />}

      {infoOpen && (
        <SessionInfo
          title={session.title}
          comment={session.comment}
          onClose={() => setInfoOpen(false)}
          onSave={(v) => { store.setMeta({ title: v.title || undefined, comment: v.comment || undefined }); setInfoOpen(false) }}
        />
      )}

      {orderOpen && (
        <div class="layer">
          <header class="px layer-head">
            <div>
              <span class="label">Dossards · vagues</span>
              <h2>Ordre de départ</h2>
            </div>
            <button class="rm" onClick={() => setOrderOpen(false)} aria-label="Fermer"><Icon name="x" size={26} /></button>
          </header>
          <p class="px layer-hint">Du premier au dernier à partir. « Part avec… » : ils partent ensemble, un seul DÉP pour la vague.</p>
          <div class="scroll px">
            <StartOrder athletes={session.athletes} onChange={store.setAthletes} started={touched} />
          </div>
        </div>
      )}

      {fixId && (
        <AthleteFix
          store={store}
          session={session}
          athleteId={fixId}
          onClose={() => setFixId(null)}
          onDone={(text, undo) => flash({ text, undo })}
        />
      )}

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
