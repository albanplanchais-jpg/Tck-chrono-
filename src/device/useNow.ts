import { useEffect, useState } from 'preact/hooks'

export function useNow(active = true, every = 47) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const i = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(i)
  }, [active, every])
  return now
}
