import { supabase } from './supabase'

/**
 * Horloge commune : chaque téléphone mesure son décalage avec l'horloge du serveur
 * (méthode NTP : on garde la mesure au plus court aller-retour). Tous les taps sont
 * enregistrés en « heure serveur », ce qui permet de prendre le départ sur un
 * téléphone et l'arrivée sur un autre.
 */
const KEY = 'tck-clock'
let offset = 0
let precision: number | null = null // ± ms (demi aller-retour de la meilleure mesure)

try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  if (saved && typeof saved.offset === 'number') ({ offset, precision } = saved)
} catch {}

/** Heure commune (ms). Sans Supabase : heure du téléphone. */
export const serverNow = () => Date.now() + offset
/** Convertit un instant du téléphone (epoch ms) en heure commune. */
export const toServer = (local: number) => local + offset
export const clockPrecision = () => precision

const listeners = new Set<() => void>()
export const onClockChange = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn))

let running: Promise<void> | null = null

export function syncClock(samples = 6): Promise<void> {
  if (!supabase || !navigator.onLine) return Promise.resolve()
  running ??= (async () => {
    let best: { rtt: number; off: number } | null = null
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now()
      const { data, error } = await supabase!.rpc('server_time')
      const t1 = Date.now()
      if (error || typeof data !== 'number') continue
      const rtt = t1 - t0
      const off = data - (t0 + t1) / 2
      if (!best || rtt < best.rtt) best = { rtt, off }
    }
    if (best) {
      offset = Math.round(best.off)
      precision = Math.max(1, Math.round(best.rtt / 2))
      try { localStorage.setItem(KEY, JSON.stringify({ offset, precision, at: Date.now() })) } catch {}
      listeners.forEach((fn) => fn())
    }
  })().finally(() => (running = null))
  return running
}
