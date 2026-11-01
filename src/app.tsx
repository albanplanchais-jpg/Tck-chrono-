import { useSessionStore } from './store/useSession'
import { Setup } from './screens/Setup'
import { Timer } from './screens/Timer'
import { Results } from './screens/Results'
import { Login } from './screens/Login'
import { AthleteView } from './screens/AthleteView'
import { cloudEnabled } from './cloud/supabase'
import { useAuth } from './cloud/auth'
import { useCloudSync } from './cloud/sync'

/** /s/CODE → page athlète (sans compte). */
const athleteCode = location.pathname.match(/^\/s\/([A-Za-z0-9]{6})\/?$/)?.[1]?.toUpperCase()

export function App() {
  return athleteCode ? <AthleteView code={athleteCode} /> : <CoachApp />
}

function CoachApp() {
  const store = useSessionStore()
  const { user, loading } = useAuth()
  const sync = useCloudSync(store.session, cloudEnabled && !!user, store.addAthletes)

  if (!store.ready || loading) return <div class="screen" />
  const s = store.session
  // Créer une séance demande un compte ; une séance déjà commencée reste accessible.
  if (cloudEnabled && !user && !s) return <Login />
  if (!s) return <Setup store={store} user={user} />
  if (!s.endedAt) return <Timer store={store} session={s} sync={sync} />
  return <Results store={store} session={s} />
}
