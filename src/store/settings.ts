import { useEffect, useState } from 'preact/hooks'

/** Réglages du chrono, propres à chaque téléphone. */
export interface Settings {
  /** Chiffres après la virgule : 1 → 00:00.0, 2 → 00:00.00 */
  precision: 1 | 2
  vibrate: boolean
  wakeLock: boolean
  beep: boolean
}

const KEY = 'tck-settings'
const DEFAULTS: Settings = { precision: 2, vibrate: true, wakeLock: true, beep: false }

let current: Settings = DEFAULTS
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) }
} catch {}

const listeners = new Set<(s: Settings) => void>()

export const getSettings = () => current

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch {}
  listeners.forEach((fn) => fn(current))
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, set] = useState(current)
  useEffect(() => {
    listeners.add(set)
    return () => { listeners.delete(set) }
  }, [])
  return [s, setSettings]
}
