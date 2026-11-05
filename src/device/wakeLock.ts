import { useEffect } from 'preact/hooks'
import { useSettings } from '../store/settings'

/** Garde l'écran allumé tant que le composant est monté. */
export function useWakeLock() {
  const [{ wakeLock }] = useSettings()
  useEffect(() => {
    if (!wakeLock) return
    let lock: WakeLockSentinel | undefined
    const acquire = async () => {
      try { if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen') } catch {}
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [wakeLock])
}
