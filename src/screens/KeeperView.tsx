import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { KIND_LABEL, uid, type Kind, type Session, type Tap } from '../core/model'
import { autoKind, computeAll, type AthleteResult } from '../core/results'
import { fmtClock, fmtDuration, fmtHM } from '../core/format'
import { frError, supabase } from '../cloud/supabase'
import { clockPrecision, onClockChange, serverNow, syncClock, toServer } from '../cloud/clock'
import { useNow } from '../device/useNow'
import { useWakeLock } from '../device/wakeLock'
import { tapFeedback } from '../device/feedback'
import { Icon } from '../components/Icon'

interface Row {
  code: string; created_at: string; ended_at: string | null; splits: number
  athletes: Session['athletes']; taps: Session['taps']; roles: Kind[]; timer_id: string; timer_name: string | null
}
interface Mine { tap: Tap; sent: boolean }

const SHORT: Record<Kind, string> = { start: 'DÉP', split: 'INT', finish: 'ARR' }
const eventTime = (e: Event) => toServer(performance.timeOrigin + e.timeStamp)

const store = (token: string) => ({
  load: (): { name?: string; mine: Mine[] } => {
    try { return JSON.parse(localStorage.getItem(`tck-keeper-${token}`) ?? '{"mine":[]}') } catch { return { mine: [] } }
  },
  save: (v: { name?: string; mine: Mine[] }) => { try { localStorage.setItem(`tck-keeper-${token}`, JSON.stringify(v)) } catch {} }
})

/** Écran d'un chronométreur invité : seulement ses boutons (départ / inter / arrivée). */
export function KeeperView({ token }: { token: string }) {
  useWakeLock()
  const st = useMemo(() => store(token), [token])
  const [row, setRow] = useState<Row | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid' | 'error'>('loading')
  const [name, setName] = useState(() => st.load().name ?? '')
  const [nameInput, setNameInput] = useState('')
  const [mine, setMine] = useState<Mine[]>(() => st.load().mine ?? [])
  const [pending, setPending] = useState<number[]>([])
  const [toast, setToast] = useState<{ text: string; extra?: string; id: string } | null>(null)
  const [pressed, setPressed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [, force] = useState(0)
  const downAt = useRef(0)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => st.save({ name, mine }), [name, mine])
  useEffect(() => { syncClock(); return onClockChange(() => force((x) => x + 1)) }, [])

  // Séance en direct (toutes les 2 s).
  useEffect(() => {
    if (!supabase) return setStatus('error')
    let stop = false
    let t: number
    const load = async () => {
      const { data, error } = await supabase!.rpc('timer_session', { p_token: token })
      if (stop) return
      if (error) setStatus((s) => (s === 'ok' ? 'ok' : 'error'))
      else if (!data?.length) return setStatus('invalid')
      else {
        const r = data[0] as Row
        setRow(r)
        setStatus('ok')
        if (r.timer_name && !name) setName(r.timer_name)
        if (r.ended_at) return
      }
      t = window.setTimeout(load, 2000)
    }
    load()
    return () => { stop = true; clearTimeout(t) }
  }, [token])

  // File d'envoi : tout tap non confirmé est renvoyé (réseau coupé, appli fermée…).
  const sending = useRef(false)
  const flush = async () => {
    if (sending.current || !supabase || !navigator.onLine) return
    const todo = mine.filter((m) => !m.sent)
    if (!todo.length) return
    sending.current = true
    for (const m of todo) {
      const { error } = await supabase.rpc('timer_tap', { p_token: token, p_tap: m.tap })
      if (!error) setMine((list) => list.map((x) => (x.tap.id === m.tap.id && x.tap === m.tap ? { ...x, sent: true } : x)))
      else if (/droit|terminée|invalide/i.test(error.message)) {
        setMine((list) => list.map((x) => (x.tap.id === m.tap.id ? { ...x, sent: true } : x)))
        flash(frError(error), undefined, '')
      }
    }
    sending.current = false
  }
  useEffect(() => { flush() }, [mine])
  useEffect(() => {
    const on = () => { setOnline(true); flush(); syncClock() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const i = setInterval(flush, 3000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(i) }
  }, [mine])

  const live = !!row && !row.ended_at
  const now = useNow(live)
  const roles = row?.roles ?? []
  const splits = row?.splits ?? 0
  const session: Session | null = useMemo(() => {
    if (!row) return null
    const byId = new Map(row.taps.map((t) => [t.id, t]))
    for (const m of mine) byId.set(m.tap.id, m.tap) // mes taps (même pas encore envoyés) font foi
    return { id: row.code, code: row.code, createdAt: Date.parse(row.created_at), splits, athletes: row.athletes, taps: [...byId.values()] }
  }, [row, mine])
  const results = useMemo(() => (session ? computeAll(session) : []), [session])
  const idle = results.filter((r) => r.openStart === undefined)
  const unsent = mine.filter((m) => !m.sent).length

  const flash = (text: string, extra: string | undefined, id: string) => {
    setToast({ text, extra, id })
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const add = (taps: Tap[]) => setMine((list) => [...list, ...taps.map((tap) => ({ tap, sent: false }))])

  const impulse = (e: PointerEvent) => {
    e.preventDefault()
    setPressed(true)
    setPending((p) => [...p, eventTime(e)])
    tapFeedback()
  }

  const canDo = (r: AthleteResult, k: Kind) =>
    roles.includes(k) &&
    (k === 'start' ? r.openStart === undefined : r.openStart !== undefined && (k !== 'split' || r.openSplits.length < splits))

  const record = (r: AthleteResult, k: Kind) => {
    if (!canDo(r, k)) return
    const t = pending[0] ?? (downAt.current || serverNow())
    if (pending.length) setPending((p) => p.slice(1))
    else tapFeedback()
    const tap: Tap = { id: uid(), t, athleteId: r.athlete.id, kind: k, by: name }
    add([tap])
    const label = k === 'split' ? `INTER ${r.openSplits.length + 1}` : KIND_LABEL[k]
    flash(`${r.athlete.name} — ${label}`, k !== 'start' && r.openStart !== undefined ? fmtDuration(t - r.openStart) : fmtClock(t), tap.id)
  }

  const massStart = () => {
    const t = pending[0]
    if (t === undefined || idle.length < 2) return
    setPending((p) => p.slice(1))
    const taps = idle.map((r) => ({ id: uid(), t, athleteId: r.athlete.id, kind: 'start' as Kind, by: name }))
    add(taps)
    flash(`${idle.length} athlètes — DÉPART`, fmtClock(t), taps.map((x) => x.id).join(','))
  }

  const undo = (ids: string) => {
    const set = new Set(ids.split(','))
    setMine((list) => list.map((m) => (set.has(m.tap.id) ? { tap: { ...m.tap, voided: true }, sent: false } : m)))
    setToast(null)
  }

  const claim = async (e: Event) => {
    e.preventDefault()
    const n = nameInput.trim()
    if (!n) return
    const { error } = await supabase!.rpc('claim_timer', { p_token: token, p_name: n })
    if (error && navigator.onLine) return flash(frError(error), undefined, '')
    setName(n)
  }

  if (status === 'loading') return <div class="screen ath-screen"><p class="px muted center-msg">Chargement…</p></div>
  if (status === 'invalid' || (status === 'error' && !row))
    return (
      <div class="screen ath-screen">
        <div class="px center-msg">
          <img src="/logo.png" alt="" width={120} height={120} />
          <h1>{status === 'invalid' ? 'Lien invalide' : 'Connexion impossible'}</h1>
          <p class="muted">{status === 'invalid' ? "Ce lien chronométreur n'existe pas ou a été retiré par le coach." : 'Vérifie ta connexion internet, puis recharge la page.'}</p>
        </div>
      </div>
    )

  const r = row!
  const rolesText = r.roles.map((k) => KIND_LABEL[k]).join(' + ')

  if (!name) {
    return (
      <div class="screen ath-screen">
        <header class="px ath-head">
          <div>
            <span class="label">Chronométreur · {r.code}</span>
            <h1>Droits : {rolesText}</h1>
          </div>
          <img src="/logo.png" alt="Torcy Canoë-Kayak" width={56} height={56} />
        </header>
        <form class="px join" onSubmit={claim}>
          <h2 class="ath-q" style={{ marginBottom: 0 }}>Ton nom ?</h2>
          <p class="muted" style={{ margin: 0 }}>Le coach verra qui a pris chaque temps.</p>
          <div class="field">
            <input value={nameInput} onInput={(e) => setNameInput((e.target as HTMLInputElement).value)} placeholder="Prénom du chronométreur" maxLength={40} autocapitalize="words" required />
            <button class="add" type="submit" aria-label="Valider">→</button>
          </div>
        </form>
      </div>
    )
  }

  const kinds = (['start', 'split', 'finish'] as Kind[]).filter((k) => r.roles.includes(k) && (k !== 'split' || splits > 0))
  const prec = clockPrecision()

  return (
    <div class="screen timer board keeper">
      <header class="timer-head px">
        <span class="label">
          {name} · {rolesText}
          <span class={`sync ${online && !unsent ? 'ok' : online ? 'pending' : 'offline'}`}>
            {' '}● {!live ? 'Séance terminée' : !online ? `Hors ligne${unsent ? ` · ${unsent} à envoyer` : ''}` : unsent ? `Envoi… (${unsent})` : `En ligne${prec ? ` · ±${prec} ms` : ''}`}
          </span>
        </span>
        <span class="pill solid">{r.code}</span>
      </header>

      <div class="status">
        {!live ? (
          <div class="last">LA SÉANCE EST TERMINÉE · MERCI {name.toUpperCase()}</div>
        ) : pending.length > 0 ? (
          <div class="confirm waiting" role="status">
            <span class="txt">
              <b>{pending.length} impulsion{pending.length > 1 ? 's' : ''} en attente</b>
              <span class="mono">{fmtClock(pending[0])} → choisir la ligne</span>
            </span>
            {r.roles.includes('start') && idle.length > 1 && idle.length === results.length ? (
              <button class="q" onClick={massStart}>Tous partent</button>
            ) : (
              <button class="q" onClick={() => setPending((p) => p.slice(1))} aria-label="Supprimer l'impulsion"><Icon name="x" size={20} /></button>
            )}
          </div>
        ) : toast ? (
          <div class="confirm" role="status">
            <span class="txt"><b>{toast.text}</b><span class="mono">{toast.extra}</span></span>
            {toast.id && <button class="undo" onClick={() => undo(toast.id)}>Annuler</button>}
            <Icon name="check" />
          </div>
        ) : (
          <div class="last">SÉANCE DE {fmtHM(Date.parse(r.created_at))} · LOGO, PUIS LIGNE</div>
        )}
      </div>

      <div class={`rows-head px n${kinds.length}`}>
        <span class="label">Athlète</span>
        <span class="label">Temps</span>
        {kinds.map((k) => <span key={k} class="label c">{SHORT[k]}</span>)}
      </div>

      <ul class={`rows n${kinds.length} ${results.length > 10 ? 'dense' : ''} ${pending.length ? 'armed' : ''}`}>
        {results.length === 0 && <li class="none">En attente des athlètes…</li>}
        {results.map((a) => {
          const run = a.openStart !== undefined
          const next = autoKind(a, splits)
          const lastRun = a.runs[a.runs.length - 1]
          return (
            <li key={a.athlete.id} class={run ? 'running' : ''}>
              <span class="nm">{run && <span class="dot" />}<span class="n">{a.athlete.name}</span></span>
              <span class="tm mono">
                {run ? fmtDuration(now - a.openStart!) : lastRun ? fmtDuration(lastRun.time) : '—'}
                {!run && a.runs.length > 0 && <small>arrivé</small>}
              </span>
              {kinds.map((k) => (
                <button
                  key={k}
                  class={`act ${k === next ? 'next' : ''}`}
                  disabled={!live || !canDo(a, k)}
                  aria-label={`${KIND_LABEL[k]} ${a.athlete.name}`}
                  onPointerDown={(e) => { downAt.current = eventTime(e) }}
                  onClick={() => record(a, k)}
                >
                  {SHORT[k]}
                </button>
              ))}
            </li>
          )
        })}
      </ul>

      <div class="tap-dock">
        <div class="ring">
          <button
            class={`tap logo ${pressed ? 'pressed' : ''}`}
            aria-label="Impulsion — capturer le temps"
            disabled={!live}
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
    </div>
  )
}
