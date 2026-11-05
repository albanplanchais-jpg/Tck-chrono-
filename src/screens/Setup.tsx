import { useEffect, useState } from 'preact/hooks'
import { uid, type Athlete, type Course } from '../core/model'
import { fmtDay } from '../core/format'
import type { Store } from '../store/useSession'
import { Icon } from '../components/Icon'
import { StartOrder } from '../components/StartOrder'
import { LicenseeSearch } from '../components/LicenseeSearch'
import type { useLicensees } from '../ffck/store'
import { label } from '../core/startOrder'
import type { User } from '@supabase/supabase-js'
import { cloudEnabled } from '../cloud/supabase'
import { signOut } from '../cloud/auth'

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

export function Setup({ store, user, courses = [], initialCourse, ffck }: {
  store: Store
  /** Licenciés FFCK (autocomplétion). */
  ffck?: ReturnType<typeof useLicensees>
  user?: User | null
  courses?: Course[]
  /** Parcours choisi depuis l'onglet Parcours (« Nouvelle séance sur ce parcours »). */
  initialCourse?: Course
}) {
  const [list, setList] = useState<Athlete[]>(store.lastGroup)
  const [hint, setHint] = useState(isIOS && !standalone)
  const [splits, setSplits] = useState(store.lastSplits)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [courseId, setCourseId] = useState<string | undefined>(initialCourse?.id)
  useEffect(() => {
    if (!initialCourse) return
    setCourseId(initialCourse.id)
    setTitle((t) => t || initialCourse.name)
    setSplits(initialCourse.splits ?? 0)
  }, [initialCourse?.id])
  const pickCourse = (c?: Course) => {
    const prev = courses.find((x) => x.id === courseId)
    setCourseId(c?.id)
    // Le nom de la séance suit le parcours tant qu'il n'a pas été changé à la main.
    setTitle((t) => (!t || t === prev?.name ? c?.name ?? '' : t))
    if (c) setSplits(c.splits ?? 0)
  }

  const has = (n: string) => list.some((a) => a.name.toLowerCase() === n.trim().toLowerCase())
  const add = (a: Athlete) =>
    !has(a.name) && !(a.licence && list.some((x) => x.licence === a.licence)) && setList((l) => [...l, { ...a, withPrev: undefined }])
  const myClub = ((user?.user_metadata?.club as string) || 'Torcy Canoë-Kayak').trim()
  const recents = store.roster.filter((a) => !has(a.name))

  return (
    <div class="screen setup">
      <div class="scroll px">
        <header class="head brand">
          <div>
            <span class="label">{fmtDay(Date.now())}</span>
            <h1>Nouvelle séance</h1>
          </div>
          <img src="/logo.png" alt="Torcy Canoë-Kayak" width={72} height={72} />
        </header>

        {user && (
          <div class="account">
            <span>Coach · <b>{(user.user_metadata?.name as string) || user.email}</b></span>
            <button class="link" onClick={signOut}>Déconnexion</button>
          </div>
        )}

        {hint && (
          <div class="banner">
            <span>Pour installer l'app : <b>Partager</b> → <b>Sur l'écran d'accueil</b>.</span>
            <button class="rm" onClick={() => setHint(false)} aria-label="Fermer"><Icon name="x" size={18} /></button>
          </div>
        )}

        {courses.length > 0 && (
          <div class="course-pick">
            <span class="label">Parcours</span>
            <div class="chips">
              <button class={`chip ${!courseId ? 'on' : ''}`} onClick={() => pickCourse(undefined)}>Libre</button>
              {courses.map((c) => (
                <button key={c.id} class={`chip ${courseId === c.id ? 'on' : ''}`} aria-pressed={courseId === c.id} onClick={() => pickCourse(c)}>
                  <Icon name="flag" size={14} stroke={2.4} />{c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label class="title-in">
          <span class="label">Nom de la séance · facultatif</span>
          <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Bassin · 6 × 1 min" maxLength={80} />
        </label>
        <label class="title-in">
          <span class="label">Commentaire · facultatif</span>
          <input value={comment} onInput={(e) => setComment((e.target as HTMLInputElement).value)} placeholder="Beaucoup de vent, eau calme…" maxLength={500} />
        </label>

        <div style={{ marginTop: 14 }}>
          <LicenseeSearch
            index={ffck?.index}
            count={ffck?.count}
            version={ffck?.version}
            status={ffck?.status ?? 'idle'}
            myClub={myClub}
            roster={store.roster}
            isAdded={(a) => list.some((x) => (a.licence && x.licence === a.licence) || x.name.toLowerCase() === a.name.toLowerCase())}
            onAdd={add}
          />
        </div>

        <div class="section-head">
          <span class="label white">Ordre de départ</span>
          <span class="count">{list.length} athlète{list.length > 1 ? 's' : ''}</span>
        </div>

        {list.length === 0 ? (
          <div class="empty-state">
            <div class="ico"><Icon name="user" size={24} stroke={1.8} /></div>
            <h3>Aucun athlète</h3>
            <p>
              {cloudEnabled
                ? "Ajoute des noms ici, ou démarre et partage le lien : les athlètes s'inscrivent eux-mêmes."
                : "Tapez un nom ci-dessus ou touchez un récent pour l'ajouter. Il faut au moins un athlète pour démarrer."}
            </p>
          </div>
        ) : (
          <StartOrder athletes={list} onChange={setList} onRemove={(id) => setList((l) => l.filter((x) => x.id !== id))} />
        )}

        {recents.length > 0 && (
          <section class="recents">
            <span class="label">Mon groupe</span>
            <div class="chips">
              {recents.map((a) => (
                <button key={a.id} class="chip" onClick={() => add(a)}><Icon name="plus" size={18} stroke={2.6} />{label(a)}</button>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer class="bottom bar">
        <div class="opt">
          <span class="label white">Chrono inter</span>
          <div class="seg-sm" role="group" aria-label="Nombre de chronos intermédiaires par passage">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} class={splits === n ? 'on' : ''} aria-pressed={splits === n} onClick={() => setSplits(n)}>
                {n === 0 ? 'Non' : n}
              </button>
            ))}
          </div>
        </div>
        <button class="btn primary" disabled={!list.length && !cloudEnabled} onClick={() => store.start(list, splits, title, comment, courseId)}>Démarrer la séance</button>
      </footer>
    </div>
  )
}
