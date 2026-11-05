import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../core/model'
import { launchBeep } from '../device/feedback'
import { Icon } from './Icon'

const INTERVALS = [0, 15, 30, 60, 120]

/** 83.4 s → "1:23.4" ; plus d'une heure → "1:02:03" */
const fmtGeneral = (ms: number) => {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, d = Math.floor(t / 100) % 10
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}.${d}`
}

interface Props {
  general: Session['general']
  now: number
  /** Prochaine vague à lancer (« 3 Emma + 10 Hugo »). */
  next?: string
  onChange: (g: Session['general']) => void
}

/**
 * Chrono général en haut de l'écran pour lancer les bateaux. Il démarre au premier
 * départ (ou avec ▶). Avec un intervalle, compte à rebours jusqu'au prochain
 * lancement + bips 3-2-1 et un bip long au top.
 */
export function GeneralClock({ general, now, next, onChange }: Props) {
  const start = general?.start
  const interval = general?.interval ?? 0
  const running = start !== undefined
  const elapsed = running ? now - start! : 0
  const per = interval * 1000
  const countdown = running && per ? per - (elapsed % per) : undefined
  const secLeft = countdown !== undefined ? Math.ceil(countdown / 1000) : undefined
  const [confirmStop, setConfirmStop] = useState(false)
  const [go, setGo] = useState(false)
  const prev = useRef<number | undefined>(undefined)

  // Bips : 3, 2, 1 puis bip long au moment du lancement.
  useEffect(() => {
    if (secLeft === undefined) return void (prev.current = undefined)
    const p = prev.current
    prev.current = secLeft
    if (p === undefined || p === secLeft) return
    if (secLeft > p) {
      launchBeep(true)
      setGo(true)
      setTimeout(() => setGo(false), 1200)
    } else if (secLeft <= 3) launchBeep(false)
  }, [secLeft])

  useEffect(() => {
    if (!confirmStop) return
    const t = setTimeout(() => setConfirmStop(false), 3000)
    return () => clearTimeout(t)
  }, [confirmStop])

  const cycle = () => onChange({ ...general, interval: INTERVALS[(INTERVALS.indexOf(interval) + 1) % INTERVALS.length] })

  return (
    <section class={`gclock ${running ? 'on' : ''} ${go ? 'go' : ''}`} aria-label="Chrono général">
      <div class="g-time">
        <small>{go ? 'Partez !' : 'Chrono général'}</small>
        <b class="mono">{fmtGeneral(elapsed)}</b>
      </div>
      <div class="g-next">
        {countdown !== undefined ? (
          <>
            <small>Prochain départ</small>
            <b class="mono">{secLeft! <= 3 ? `${secLeft}` : fmtGeneral(countdown).replace(/\.\d$/, '')}</b>
            {next && <span>{next}</span>}
          </>
        ) : running ? (
          next ? (<><small>Prochain</small><span class="solo">{next}</span></>) : null
        ) : (
          <span class="g-hint">Démarre au 1<sup>er</sup> départ ou avec ▶</span>
        )}
      </div>
      <button class={`g-int ${interval ? 'set' : ''}`} onClick={cycle} aria-label="Intervalle entre les départs">
        {interval ? (interval >= 60 ? `${interval / 60} min` : `${interval} s`) : 'Interv.'}
      </button>
      {running ? (
        <button
          class={`g-btn ${confirmStop ? 'warn' : ''}`}
          aria-label={confirmStop ? 'Confirmer la remise à zéro' : 'Remettre le chrono général à zéro'}
          onClick={() => (confirmStop ? (onChange({ interval: general?.interval }), setConfirmStop(false)) : setConfirmStop(true))}
        >
          {confirmStop ? '0 ?' : <Icon name="stop" size={16} stroke={2.6} />}
        </button>
      ) : (
        <button class="g-btn play" aria-label="Lancer le chrono général" onClick={() => onChange({ ...general, start: now })}>
          <Icon name="play" size={16} stroke={2.4} />
        </button>
      )}
    </section>
  )
}
