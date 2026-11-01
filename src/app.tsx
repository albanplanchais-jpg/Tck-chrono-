import { useSessionStore } from './store/useSession'
import { Setup } from './screens/Setup'
import { Timer } from './screens/Timer'
import { Results } from './screens/Results'

export function App() {
  const store = useSessionStore()
  if (!store.ready) return <div class="screen" />
  const s = store.session
  if (!s) return <Setup store={store} />
  if (!s.endedAt) return <Timer store={store} session={s} />
  return <Results store={store} session={s} />
}
