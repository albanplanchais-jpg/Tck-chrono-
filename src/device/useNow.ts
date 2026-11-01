import { useEffect, useState } from 'preact/hooks'
import { serverNow } from '../cloud/clock'

export function useNow(active = true, every = 47) {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    if (!active) return
    const i = setInterval(() => setNow(serverNow()), every)
    return () => clearInterval(i)
  }, [active, every])
  return now
}
