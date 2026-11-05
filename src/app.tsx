import { useEffect, useRef, useState } from 'preact/hooks'
import type { Course, Session } from './core/model'
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
import { Courses } from './screens/Courses'
import { Athletes } from './screens/Athletes'
import { TabBar, type Tab } from './components/TabBar'
import { useLicensees } from './ffck/store'
import { AthleteHome } from './screens/AthleteHome'
import { SessionHome } from './screens/SessionHome'

/** /s/CODE → page athlète (sans compte). */
const athleteCode = location.pathname.match(/^\/s\/([A-Za-z0-9]{6})\/?$/)?.[1]?.toUpperCase()
/** /t/TOKEN → chronométreur invité (droits limités). */
const keeperToken = location.pathname.match(/^\/t\/([a-z0-9]{16,40})\/?$/)?.[1]

export function App() {
  if (keeperToken) return <KeeperView token={keeperToken} />
  return athleteCode ? <AthleteView code={athleteCode} /> : <Accounts />
}

/** Compte athlète → ses résultats ; sinon espace coach. */
function Accounts() {
  const { user, loading } = useAuth()
  if (loading) return <div class="screen" />
  if (user?.user_metadata?.role === 'athlete') return <AthleteHome user={user} />
  return <CoachApp />
}

function CoachApp() {
  const store = useSessionStore()
  const { user, loading } = useAuth()
  const online = cloudEnabled && !!user
  const sync = useCloudSync(store.session, online, { onJoined: store.addAthletes, onRemoteTaps: store.mergeRemote })
  const data = useCoachData(online)
  const ffck = useLicensees(online)
  const [tab, setTab] = useState<Tab>('session')
  const [viewing, setViewing] = useState<Session | null>(null)
  const [startCourse, setStartCourse] = useState<Course | undefined>(undefined)
  // Onglet Séance : accueil (gros bouton) puis préparation.
  const [preparing, setPreparing] = useState(false)
  const s = store.session

  // Le groupe enregistré en base alimente « Mon groupe » sur le téléphone.
  useEffect(() => { if (data.group) store.mergeRoster(data.group) }, [data.group])
  // Historique rechargé en ouvrant Historique / Profil, et après la fin d'une séance.
  useEffect(() => { if (tab !== 'session') data.refresh() }, [tab])
  // Le parcours choisi ne sert qu'à préparer la prochaine séance.
  // « Nouvelle séance » depuis les résultats : on va directement à la préparation.
  const hadSession = useRef(!!s)
  useEffect(() => {
    if (s && startCourse) setStartCourse(undefined)
    if (s) setPreparing(false)
    else if (hadSession.current) setPreparing(true)
    hadSession.current = !!s
  }, [s?.id])
  // Séance terminée : gardée sous la main (poursuite juste après) et historique rechargé,
  // même si le coach enchaîne aussitôt sur une nouvelle séance.
  const lastEnded = useRef<Session | undefined>(undefined)
  if (s?.endedAt) lastEnded.current = s
  useEffect(() => {
    if (!s?.endedAt) return
    setTimeout(data.refresh, 1500)
  }, [s?.endedAt])

  if (!store.ready || loading) return <div class="screen" />
  // Créer une séance demande un compte ; une séance déjà commencée reste accessible.
  if (cloudEnabled && !user && !s) return <Login />
  // Séance en cours : plein écran, le logo reste toujours au même endroit.
  if (s && !s.endedAt) return <Timer store={store} session={s} sync={sync} />

  const go = (t: Tab) => { setViewing(null); setTab(t) }
  // Séances partagées : celles des autres coachs sont visibles en lecture seule.
  const isMine = (x: Session) => !x.coachId || x.coachId === user?.id
  const mine = data.sessions.filter(isMine)
  const recentMine = lastEnded.current && !mine.some((x) => x.id === lastEnded.current!.id) ? [lastEnded.current, ...mine] : mine
  let screen
  if (viewing)
    screen = (
      <Results
        session={viewing}
        onBack={() => setViewing(null)}
        onEditMeta={
          isMine(viewing)
            ? async (patch) => {
                await updateSessionMeta(viewing, patch)
                setViewing({ ...viewing, ...patch })
                data.refresh()
              }
            : undefined
        }
      />
    )
  else if (tab === 'history')
    screen = <History courses={data.courses} sessions={data.sessions} userId={user?.id} loading={data.loading} source={data.source} onOpen={setViewing} onRefresh={data.refresh} />
  else if (tab === 'courses')
    screen = (
      <Courses
        courses={data.courses}
        sessions={data.sessions}
        group={store.roster}
        busy={!!s && !s.endedAt}
        onSave={data.upsertCourse}
        onDelete={data.deleteCourse}
        onOpenSession={setViewing}
        onStartOn={(c) => {
          // Séance terminée affichée : on la ferme pour préparer la nouvelle.
          if (s?.endedAt) store.reset()
          setStartCourse(c)
          go('session')
        }}
      />
    )
  else if (tab === 'athletes')
    screen = (
      <Athletes
        group={store.roster}
        sessions={data.sessions}
        courses={data.courses}
        onAddAthlete={store.addToRoster}
        onRemoveAthlete={store.removeFromRoster}
        onOpenSession={setViewing}
      />
    )
  else if (tab === 'profile')
    screen = (
      <Profile
        user={user}
        group={store.roster}
        sessions={mine}
        onOpenSession={setViewing}
        onAllSessions={() => go('history')}
        onProfileSaved={data.refresh}
      />
    )
  else
    screen = s ? (
      <Results store={store} session={s} />
    ) : preparing || startCourse ? (
      <Setup
        key={startCourse?.id ?? 'free'}
        store={store}
        user={user}
        courses={data.courses}
        initialCourse={startCourse}
        ffck={ffck}
        sessions={recentMine}
        onBack={() => { setPreparing(false); setStartCourse(undefined) }}
      />
    ) : (
      <SessionHome user={user} last={recentMine[0]} onNew={() => setPreparing(true)} onOpenLast={setViewing} onProfile={() => go('profile')} />
    )

  return (
    <div class="shell">
      {screen}
      <TabBar tab={viewing && tab === 'session' ? 'history' : tab} onChange={go} />
    </div>
  )
}
