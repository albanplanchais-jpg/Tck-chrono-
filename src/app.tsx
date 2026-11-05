import { useEffect, useState } from 'preact/hooks'
import type { Session } from './core/model'
import { useSessionStore } from './store/useSession'
import { Setup } from './screens/Setup'
import { Timer } from './screens/Timer'
import { Results } from './screens/Results'
import { Login } from './screens/Login'
import { AthleteView } from './screens/AthleteView'
import { KeeperView } from './screens/KeeperView'
import { cloudEnabled } from './cloud/supabase'
import { useAuth } from './cloud/auth'
import { useCloudSync } from './cloud/sync'
import { updateSessionMeta, useCoachData } from './cloud/history'
import { History } from './screens/History'
import { Profile } from './screens/Profile'
import { TabBar, type Tab } from './components/TabBar'

/** /s/CODE → page athlète (sans compte). */
const athleteCode = location.pathname.match(/^\/s\/([A-Za-z0-9]{6})\/?$/)?.[1]?.toUpperCase()
/** /t/TOKEN → chronométreur invité (droits limités). */
const keeperToken = location.pathname.match(/^\/t\/([a-z0-9]{16,40})\/?$/)?.[1]

export function App() {
  if (keeperToken) return <KeeperView token={keeperToken} />
  return athleteCode ? <AthleteView code={athleteCode} /> : <CoachApp />
}

function CoachApp() {
  const store = useSessionStore()
  const { user, loading } = useAuth()
  const online = cloudEnabled && !!user
  const sync = useCloudSync(store.session, online, { onJoined: store.addAthletes, onRemoteTaps: store.mergeRemote })
  const data = useCoachData(online)
  const [tab, setTab] = useState<Tab>('session')
  const [viewing, setViewing] = useState<Session | null>(null)
  const s = store.session

  // Le groupe enregistré en base alimente « Mon groupe » sur le téléphone.
  useEffect(() => { if (data.group) store.mergeRoster(data.group) }, [data.group])
  // Historique rechargé en ouvrant Historique / Profil, et après la fin d'une séance.
  useEffect(() => { if (tab !== 'session') data.refresh() }, [tab])
  useEffect(() => {
    if (!s?.endedAt) return
    const t = setTimeout(data.refresh, 1500)
    return () => clearTimeout(t)
  }, [s?.endedAt])

  if (!store.ready || loading) return <div class="screen" />
  // Créer une séance demande un compte ; une séance déjà commencée reste accessible.
  if (cloudEnabled && !user && !s) return <Login />
  // Séance en cours : plein écran, le logo reste toujours au même endroit.
  if (s && !s.endedAt) return <Timer store={store} session={s} sync={sync} />

  const go = (t: Tab) => { setViewing(null); setTab(t) }
  let screen
  if (viewing)
    screen = (
      <Results
        session={viewing}
        onBack={() => setViewing(null)}
        onEditMeta={async (patch) => {
          await updateSessionMeta(viewing, patch)
          setViewing({ ...viewing, ...patch })
          data.refresh()
        }}
      />
    )
  else if (tab === 'history')
    screen = <History sessions={data.sessions} loading={data.loading} source={data.source} onOpen={setViewing} onRefresh={data.refresh} />
  else if (tab === 'profile')
    screen = (
      <Profile
        user={user}
        group={store.roster}
        sessions={data.sessions}
        onAddAthlete={store.addToRoster}
        onRemoveAthlete={store.removeFromRoster}
        onOpenSession={setViewing}
        onAllSessions={() => go('history')}
        onProfileSaved={data.refresh}
      />
    )
  else screen = s ? <Results store={store} session={s} /> : <Setup store={store} user={user} />

  return (
    <div class="shell">
      {screen}
      <TabBar tab={viewing ? (tab === 'session' ? 'history' : tab) : tab} onChange={go} />
    </div>
  )
}
