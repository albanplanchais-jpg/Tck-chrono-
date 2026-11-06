import { useMemo, useState } from 'preact/hooks'
import { uid, type Athlete, type Course, type Session } from '../core/model'
import { courseStats, summarize } from '../core/stats'
import { fmtDay, fmtDuration } from '../core/format'
import { SessionItem } from '../components/SessionItem'
import { Icon } from '../components/Icon'

interface Props {
  courses: Course[]
  sessions: Session[]
  group: Athlete[]
  onSave: (c: Course) => void
  onDelete: (id: string) => void
  onStartOn: (c: Course) => void
  onOpenSession: (s: Session) => void
  /** Une séance est déjà en cours : on ne peut pas en lancer une autre. */
  busy?: boolean
}

export const courseInfo = (c: Course) =>
  [c.distance ? (c.distance >= 1000 ? `${(c.distance / 1000).toLocaleString('fr-FR')} km` : `${c.distance} m`) : null, c.splits ? `${c.splits} inter${c.splits > 1 ? 's' : ''}` : null]
    .filter(Boolean)
    .join(' · ')

/** Mes parcours : parcours de référence, avec record et classement des meilleurs temps. */
export function Courses({ courses, sessions, group, onSave, onDelete, onStartOn, onOpenSession, busy }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<Course | 'new' | null>(null)
  const stats = useMemo(() => new Map(courses.map((c) => [c.id, courseStats(c.id, sessions, group)])), [courses, sessions, group])
  const current = courses.find((c) => c.id === open)

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head">
          <div>
            <span class="label">Mes parcours</span>
            <h1>Parcours</h1>
          </div>
          <button class="icon-btn" onClick={() => setForm('new')} aria-label="Nouveau parcours"><Icon name="plus" size={20} stroke={2.6} /></button>
        </header>

        {!courses.length ? (
          <div class="empty-state">
            <div class="ico"><Icon name="flag" size={24} stroke={1.8} /></div>
            <h3>Aucun parcours</h3>
            <p>Crée tes parcours de base (bassin, rivière, slalom…) : chaque séance faite dessus alimente le classement et le record du parcours.</p>
            <button class="btn primary" style={{ marginTop: 18 }} onClick={() => setForm('new')}><Icon name="plus" size={20} />Créer un parcours</button>
          </div>
        ) : (
          <ul class="course-cards">
            {courses.map((c) => {
              const st = stats.get(c.id)!
              return (
                <li key={c.id}>
                  <button class="course-card" onClick={() => setOpen(c.id)}>
                    <span class="cc-top">
                      <span class="cc-name"><b>{c.name}</b>{courseInfo(c) && <small>{courseInfo(c)}</small>}</span>
                      <Icon name="right" size={18} />
                    </span>
                    <TrackArt splits={c.splits ?? 0} />
                    <span class="cc-foot">
                      <span class="cc-rec">
                        {st.record ? (
                          <>
                            <small>Record</small>
                            <b class="mono">{fmtDuration(st.record.best)}</b>
                            <small class="cc-who">{st.record.athlete.name}</small>
                          </>
                        ) : (
                          <small>Pas encore de temps</small>
                        )}
                      </span>
                      <span class="cc-num"><b class="mono">{st.sessions.length}</b><small>séance{st.sessions.length > 1 ? 's' : ''}</small></span>
                      <span class="cc-num"><b class="mono">{st.board.length}</b><small>athlète{st.board.length > 1 ? 's' : ''}</small></span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {courses.length > 0 && (
          <button class="soft-btn" onClick={() => setForm('new')}><Icon name="plus" size={18} stroke={2.6} />Nouveau parcours</button>
        )}
        <div style={{ height: 24 }} />
      </div>

      {current && (
        <CoursePage
          course={current}
          st={stats.get(current.id)!}
          busy={busy}
          onClose={() => setOpen(null)}
          onStart={() => onStartOn(current)}
          onEdit={() => setForm(current)}
          onDelete={() => { onDelete(current.id); setOpen(null) }}
          onOpenSession={onOpenSession}
        />
      )}
      {form && (
        <CourseForm
          course={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSave={(c) => { onSave(c); setForm(null) }}
        />
      )}
    </div>
  )
}

function CoursePage({ course, st, busy, onClose, onStart, onEdit, onDelete, onOpenSession }: {
  course: Course
  st: ReturnType<typeof courseStats>
  busy?: boolean
  onClose: () => void
  onStart: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenSession: (s: Session) => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div class="layer">
      <header class="px layer-head">
        <div style={{ minWidth: 0 }}>
          <span class="label">Parcours{courseInfo(course) ? ` · ${courseInfo(course)}` : ''}</span>
          <h2>{course.name}</h2>
        </div>
        <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={26} /></button>
      </header>
      <div class="scroll px">
        {course.notes && <p class="res-comment" style={{ marginTop: 0 }}>{course.notes}</p>}
        <div class="course-hero">
          <TrackArt splits={course.splits ?? 0} big />
          <div class="ch-labels label"><span>Départ</span>{course.distance ? <span>{courseInfo(course).split(' · ')[0]}</span> : <span />}<span>Arrivée</span></div>
        </div>
        <div class="statbox">
          <div><b class="mono">{st.record ? fmtDuration(st.record.best) : '—'}</b><span>Record</span></div>
          <div><b class="mono">{st.sessions.length}</b><span>Séances</span></div>
          <div><b class="mono">{st.board.length}</b><span>Athlètes</span></div>
        </div>
        <button class="btn primary" style={{ marginTop: 14 }} disabled={busy} onClick={onStart}>
          <Icon name="play" size={18} />Lancer une séance ici
        </button>
        {busy && <p class="note" style={{ marginTop: 8 }}>Une séance est déjà en cours.</p>}

        <div class="sec-head"><h2>Podium</h2><span class="label">{st.board.length} athlète{st.board.length > 1 ? 's' : ''}</span></div>
        {!st.board.length && <p class="muted">Lance une séance sur ce parcours pour remplir le classement.</p>}
        {st.board.length > 0 && (
          <div class="podium">
            {[1, 0, 2].map((i) => {
              const e = st.board[i]
              if (!e) return <span key={i} class="pod empty" />
              return (
                <button key={i} class={`pod p${i + 1}`} onClick={() => onOpenSession(e.session)}>
                  <span class="pod-name">{e.athlete.bib !== undefined && <span class="bibn mono">{e.athlete.bib}</span>}{e.athlete.name}</span>
                  <span class="pod-time mono">{fmtDuration(e.best)}</span>
                  {i > 0 && <span class="pod-gap mono">+{fmtDuration(e.best - st.board[0].best)}</span>}
                  <span class="pod-step"><b>{i + 1}</b></span>
                </button>
              )
            })}
          </div>
        )}

        <Progress sessions={st.sessions} record={st.record?.best} />

        {st.board.length > 3 && (
          <>
            <div class="sec-head"><h2>Classement</h2></div>
            <ol class="lboard" start={4}>
              {st.board.slice(3).map((e, j) => (
                <li key={e.athlete.id}>
                  <button onClick={() => onOpenSession(e.session)}>
                    <span class="rk">{j + 4}</span>
                    <span class="g-name">
                      <b>{e.athlete.bib !== undefined && <span class="bibn mono">{e.athlete.bib}</span>}{e.athlete.name}</b>
                      <small>{fmtDay(e.session.createdAt)} · {e.runs} passage{e.runs > 1 ? 's' : ''}</small>
                    </span>
                    <span class="g-time mono">
                      {fmtDuration(e.best)}
                      <small class="gap mono">+{fmtDuration(e.best - st.board[0].best)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}

        <div class="sec-head"><h2>Séances</h2></div>
        {!st.sessions.length && <p class="muted">Aucune séance sur ce parcours.</p>}
        <ul class="sess-list">
          {st.sessions.map((s) => <SessionItem key={s.id} sum={summarize(s)} onOpen={() => onOpenSession(s)} />)}
        </ul>

        <div class="row2" style={{ marginTop: 22 }}>
          <button class="btn outline" onClick={onEdit}>Modifier</button>
          <button class="btn outline" onClick={() => setConfirm(true)}>Supprimer</button>
        </div>
        {confirm && (
          <div class="danger">
            <p>Supprimer le parcours « {course.name} » ? Les séances restent dans l'historique.</p>
            <div class="row2">
              <button class="btn outline" onClick={() => setConfirm(false)}>Garder</button>
              <button class="btn primary" onClick={onDelete}>Supprimer</button>
            </div>
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>
    </div>
  )
}

function CourseForm({ course, onClose, onSave }: { course?: Course; onClose: () => void; onSave: (c: Course) => void }) {
  const [name, setName] = useState(course?.name ?? '')
  const [distance, setDistance] = useState(course?.distance ? String(course.distance) : '')
  const [splits, setSplits] = useState(course?.splits ?? 0)
  const [notes, setNotes] = useState(course?.notes ?? '')
  const submit = (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const d = parseInt(distance.replace(/\D/g, ''), 10)
    onSave({
      id: course?.id ?? uid(),
      name: n.slice(0, 60),
      ...(Number.isFinite(d) && d > 0 ? { distance: d } : {}),
      ...(splits ? { splits } : {}),
      ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {})
    })
  }
  return (
    <div class="modal-wrap" onClick={onClose}>
      <form class="modal login-form info" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>{course ? 'Modifier le parcours' : 'Nouveau parcours'}</h2>
          <button type="button" class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>
        <label>
          <span class="label">Nom du parcours</span>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Bassin 500 m, Rivière Torcy…" maxLength={60} required />
        </label>
        <label>
          <span class="label">Distance en mètres · facultatif</span>
          <input value={distance} onInput={(e) => setDistance((e.target as HTMLInputElement).value)} placeholder="500" inputMode="numeric" />
        </label>
        <div class="opt">
          <span class="label white">Inters</span>
          <div class="seg-sm" role="group" aria-label="Nombre d'inters sur ce parcours">
            {[0, 1, 2, 3].map((n) => (
              <button type="button" key={n} class={splits === n ? 'on' : ''} aria-pressed={splits === n} onClick={() => setSplits(n)}>{n === 0 ? 'Non' : n}</button>
            ))}
          </div>
        </div>
        <label>
          <span class="label">Notes · facultatif</span>
          <textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="Départ au ponton, arrivée à la bouée…" rows={3} maxLength={300} />
        </label>
        <button class="btn primary" type="submit">{course ? 'Enregistrer' : 'Créer le parcours'}</button>
      </form>
    </div>
  )
}

/** Tracé du parcours : une rivière du départ (rond) à l'arrivée (drapeau), avec les inters. */
function TrackArt({ splits, big }: { splits: number; big?: boolean }) {
  const W = 300, H = big ? 70 : 44, mid = H / 2, amp = big ? 14 : 9
  const y = (x: number) => mid + amp * Math.sin(((x - 14) / (W - 28)) * Math.PI * 2.2)
  const pts = Array.from({ length: 61 }, (_, i) => { const x = 14 + ((W - 28) * i) / 60; return `${x.toFixed(1)},${y(x).toFixed(1)}` })
  const inters = Array.from({ length: splits }, (_, i) => 14 + ((W - 28) * (i + 1)) / (splits + 1))
  const fx = W - 14
  return (
    <svg class={`track-art ${big ? 'big' : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width={big ? 16 : 11} stroke-linecap="round" stroke-linejoin="round" />
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round" />
      {inters.map((x, i) => (
        <g key={i}>
          <line x1={x} y1={y(x) - 9} x2={x} y2={y(x) + 9} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
          {big && <text x={x} y={y(x) - 13} text-anchor="middle" class="ta-t">INT{i + 1}</text>}
        </g>
      ))}
      <circle cx="14" cy={y(14)} r="6" fill="currentColor" />
      <line x1={fx} y1={y(fx) + 8} x2={fx} y2={y(fx) - 16} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      <path d={`M${fx} ${y(fx) - 16} h11 l-3 4.5 l3 4.5 h-11 z`} fill="currentColor" />
    </svg>
  )
}

/** Progression : meilleur temps de chaque séance sur ce parcours (de la plus ancienne à la plus récente). */
function Progress({ sessions, record }: { sessions: Session[]; record?: number }) {
  const pts = [...sessions].reverse().map((s) => ({ s, t: summarize(s).best?.time })).filter((p): p is { s: Session; t: number } => p.t !== undefined)
  if (pts.length < 2 || record === undefined) return null
  const W = 300, H = 120, px = 10, top = 14, bottom = 22
  const min = Math.min(...pts.map((p) => p.t)), max = Math.max(...pts.map((p) => p.t))
  const span = max - min || 1
  const X = (i: number) => px + ((W - 2 * px) * i) / (pts.length - 1)
  // Plus rapide = plus haut.
  const Y = (t: number) => top + ((t - min) / span) * (H - top - bottom)
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.t).toFixed(1)}`).join(' ')
  return (
    <>
      <div class="sec-head"><h2>Progression</h2><span class="label">Meilleur temps par séance</span></div>
      <div class="progress-card">
        <svg viewBox={`0 0 ${W} ${H}`} class="progress" role="img" aria-label={`Meilleurs temps de ${pts.length} séances, record ${fmtDuration(record)}`}>
          <line x1={px} x2={W - px} y1={Y(record)} y2={Y(record)} class="pg-rec" />
          <polygon points={`${X(0)},${H - bottom} ${line} ${X(pts.length - 1)},${H - bottom}`} class="pg-area" />
          <polyline points={line} class="pg-line" />
          {pts.map((p, i) => <circle key={p.s.id} cx={X(i)} cy={Y(p.t)} r={p.t === record ? 5 : 3.5} class={p.t === record ? 'pg-dot rec' : 'pg-dot'} />)}
          <text x={px} y={H - 6} class="pg-t">{fmtDay(pts[0].s.createdAt)}</text>
          <text x={W - px} y={H - 6} class="pg-t" text-anchor="end">{fmtDay(pts[pts.length - 1].s.createdAt)}</text>
        </svg>
        <div class="pg-legend mono"><span>Record {fmtDuration(record)}</span><span>Plus lent {fmtDuration(max)}</span></div>
      </div>
    </>
  )
}
