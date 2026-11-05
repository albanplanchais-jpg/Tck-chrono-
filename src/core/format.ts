import { getSettings } from '../store/settings'

const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, '0')

/** 83456 → "01:23.45" (ou "01:23.4" en précision dixième) ; 3723456 → "1:02:03.45" */
export function fmtDuration(ms: number, precision: 1 | 2 = getSettings().precision): string {
  if (ms < 0) ms = 0
  const frac = precision === 1 ? String(Math.floor(ms / 100) % 10) : pad(Math.floor(ms / 10) % 100)
  const s = Math.floor(ms / 1000) % 60
  const m = Math.floor(ms / 60000) % 60
  const h = Math.floor(ms / 3600000)
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${frac}` : `${pad(m)}:${pad(s)}.${frac}`
}

export const fmtGap = (ms: number) => (ms === 0 ? '—' : `+${fmtDuration(ms)}`)

export function fmtClock(t: number): string {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds() / 10)}`
}

export const fmtHM = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Dim. 1 nov." */
export function fmtDay(t: number): string {
  const s = new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const fmtDate = (t: number) => `${fmtDay(t)} · ${fmtHM(t)}`
