import { useEffect, useState } from 'preact/hooks'
import { MODE_LABEL, type Athlete, type Course, type Session, type SessionMode } from '../core/model'
import { fmtOffset, pursuitPlan, type PursuitEntry } from '../core/modes'
import { fmtDay, fmtDuration, fmtHM } from '../core/format'
import type { Store } from '../store/useSession'
import { Icon } from '../components/Icon'
import { StartOrder } from '../components/StartOrder'
import { LicenseeSearch } from '../components/LicenseeSearch'
import type { useLicensees } from '../ffck/store'
import { label } from '../core/startOrder'
import type { User } from '@supabase/supabase-js'
import { cloudEnabled } from '../cloud/supabase'

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

export function Setup({ store, user, courses = [], initialCourse, ffck, sessions = [], onBack }: {
  store: Store
  /** Séances passées : référence pour une poursuite. */
  sessions?: Session[]
  /** Retour à l'accueil de l'onglet Séance. */
  onBack?: () => void
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
  const [showMeta, setShowMeta] = useState(false)
  const [mode, setMode] = useState<SessionMode>('classic')
  // Poursuite : séance de référence et ordre / décalages calculés.
  const [fromId, setFromId] = useState<string | null>(null)
  const [plan, setPlan] = useState<PursuitEntry[]>([])
  const candidates = sessions.filter((x) => x.endedAt && pursuitPlan(x).entries.length >= 2).slice(0, 12)
  const pickSource = (src: Session) => {
    setFromId(src.id)
    setPlan(pursuitPlan(src).entries)
    setTitle((t) => t || `Poursuite · ${src.title || fmtDay(src.createdAt)}`)
  }
  /** Retirer un athlète : les décalages repartent du plus lent restant. */
  const removeFromPlan = (id: string) =>
    setPlan((p) => {
      const rest = p.filter((e) => e.athlete.id !== id)
      const base = Math.min(...rest.map((e) => e.offset))
      return rest.map((e) => ({ ...e, offset: e.offset - base }))
    })
  const begin = () => {
    if (mode === 'pursuit') {
      const src = sessions.find((x) => x.id === fromId)
      store.start(plan.map((e) => ({ ...e.athlete, withPrev: undefined })), splits, title, comment, courseId, {
        mode,
        pursuit: {
          fromId: fromId ?? undefined,
          fromTitle: src?.title || (src ? fmtDay(src.createdAt) : undefined),
          offsets: Object.fromEntries(plan.map((e) => [e.athlete.id, e.offset])),
          refs: Object.fromEntries(plan.map((e) => [e.athlete.id, e.ref]))
        }
      })
    } else store.start(list, splits, title, comment, courseId, { mode })
  }
  const canStart = mode === 'pursuit' ? plan.length >= 1 : !!list.length || cloudEnabled
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
        {onBack && (
          <button class="back" onClick={onBack}><Icon name="left" size={18} stroke={2.6} />Accueil</button>
        )}
        <header class="head brand">
          <div>
            <span class="label">{fmtDay(Date.now())}</span>
            <h1>Nouvelle séance</h1>
          </div>
          <img src="/logo.png" alt="Torcy Canoë-Kayak" width={72} height={72} />
        </header>

        <div class="segment n3 mode-pick" role="group" aria-label="Type de séance">
          {(['classic', 'mass', 'pursuit'] as SessionMode[]).map((m) => (
            <button key={m} class={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <p class="mode-help">
          {mode === 'classic'
            ? 'Chacun part quand tu touches son DÉP (seul ou par vagues).'
            : mode === 'mass'
              ? 'Tout le monde part en même temps : un seul toucher sur le logo donne le départ.'
              : 'Le plus lent part en premier, chacun avec son écart de temps : le premier arrivé gagne. Départs donnés automatiquement.'}
        </p>

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

        {mode === 'pursuit' ? (
          <section class="pursuit">
            <span class="label white">Séance de référence</span>
            {!candidates.length && <p class="muted">Il faut une séance terminée avec au moins 2 athlètes chronométrés.</p>}
            <div class="chips src-pick">
              {candidates.map((x) => (
                <button key={x.id} class={`chip ${fromId === x.id ? 'on' : ''}`} onClick={() => pickSource(x)}>
                  {x.title || 'Séance'} · {fmtDay(x.createdAt)} {fmtHM(x.createdAt)}
                </button>
              ))}
            </div>
            {plan.length > 0 && (
              <>
                <div class="order-tools"><span class="label white">Ordre de départ · {plan.length}</span><span class="label">Écart</span></div>
                <ol class="plan">
                  {plan.map((e, i) => (
                    <li key={e.athlete.id}>
                      <span class="idx mono">{i + 1}</span>
                      <span class="p-name">
                        <b>{e.athlete.bib !== undefined && <span class="bibn mono">{e.athlete.bib}</span>}{e.athlete.name}</b>
                        <small class="mono">réf. {fmtDuration(e.ref)}</small>
                      </span>
                      <b class="mono p-off">{fmtOffset(e.offset)}</b>
                      <button class="rm" onClick={() => removeFromPlan(e.athlete.id)} aria-label={`Retirer ${e.athlete.name}`}><Icon name="x" size={18} /></button>
                    </li>
                  ))}
                </ol>
                <p class="mode-help">Départ du dernier à {fmtOffset(Math.max(...plan.map((e) => e.offset)))} après le top.</p>
              </>
            )}
          </section>
        ) : (
          <>
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
          </>
        )}

        <div class="meta-box">
          {showMeta ? (
            <>
              <label class="title-in">
                <span class="label">Nom de la séance</span>
                <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Bassin · 6 × 1 min" maxLength={80} />
              </label>
              <label class="title-in">
                <span class="label">Commentaire</span>
                <input value={comment} onInput={(e) => setComment((e.target as HTMLInputElement).value)} placeholder="Beaucoup de vent, eau calme…" maxLength={500} />
              </label>
            </>
          ) : (
            <button class="meta-toggle" onClick={() => setShowMeta(true)}>
              <Icon name="edit" size={15} stroke={2.4} />
              {title || comment ? <span><b>{title || 'Séance'}</b>{comment ? ` · ${comment}` : ''}</span> : <span>Nom et commentaire <small>facultatif</small></span>}
            </button>
          )}
        </div>
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
        <button class="btn primary" disabled={!canStart} onClick={begin}>
          {mode === 'classic' ? 'Démarrer la séance' : mode === 'mass' ? 'Préparer le mass start' : 'Préparer la poursuite'}
        </button>
      </footer>
    </div>
  )
}
