import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Session } from '../core/model'
import { computeAll, ranking } from '../core/results'
import { fmtDay, fmtDuration, fmtGap, fmtHM } from '../core/format'
import { supabase, frError } from '../cloud/supabase'
import { useNow } from '../device/useNow'
import { label, parseBib } from '../core/startOrder'

interface Row { code: string; created_at: string; ended_at: string | null; splits: number; athletes: Session['athletes']; taps: Session['taps']; updated_at: string }

const meKey = (code: string) => `tck-me-${code}`
const loadMe = (code: string) => { try { return localStorage.getItem(meKey(code)) } catch { return null } }
const saveMe = (code: string, name: string | null) => {
  try { name ? localStorage.setItem(meKey(code), name) : localStorage.removeItem(meKey(code)) } catch {}
}

/** Page ouverte par le lien du coach : l'athlète rejoint la séance et suit son chrono en direct. */
export function AthleteView({ code }: { code: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [me, setMe] = useState<string | null>(() => loadMe(code))
  const [joining, setJoining] = useState(false)
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [error, setError] = useState('')
  const [lastSeen, setLastSeen] = useState(0)

  // Mise à jour en direct (toutes les 2 s, plus lent une fois la séance finie).
  useEffect(() => {
    if (!supabase) return setStatus('error')
    let stop = false
    let t: number
    const load = async () => {
      const { data, error } = await supabase!.rpc('public_session', { p_code: code })
      if (stop) return
      if (error) setStatus('error')
      else if (!data?.length) setStatus('missing')
      else {
        const r = data[0] as Row
        setSession({
          id: r.code,
          code: r.code,
          createdAt: Date.parse(r.created_at),
          endedAt: r.ended_at ? Date.parse(r.ended_at) : undefined,
          splits: r.splits,
          athletes: r.athletes ?? [],
          taps: r.taps ?? []
        })
        setStatus('ok')
        setLastSeen(Date.now())
        if (r.ended_at) return
      }
      t = window.setTimeout(load, 2000)
    }
    load()
    return () => { stop = true; clearTimeout(t) }
  }, [code])

  const live = !!session && !session.endedAt
  const now = useNow(live)
  const results = useMemo(() => (session ? computeAll(session) : []), [session])
  const rank = useMemo(() => (session ? ranking(session) : []), [session])
  const mine = me ? results.find((r) => r.athlete.name.toLowerCase() === me.toLowerCase()) : undefined
  const myRank = mine ? rank.find((r) => r.athlete.id === mine.athlete.id) : undefined

  const choose = (n: string) => { saveMe(code, n); setMe(n) }

  const join = async (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setError('')
    setJoining(true)
    const b = parseBib(bib)
    let { error } = await supabase!.rpc('join_session', { p_code: code, p_name: n, p_bib: b ?? null })
    // Repli si la migration 0003 n'est pas encore passée (ancienne fonction sans dossard).
    if (error && /PGRST202|Could not find the function/i.test(`${error.code} ${error.message}`))
      ({ error } = await supabase!.rpc('join_session', { p_code: code, p_name: n }))
    setJoining(false)
    if (error) return setError(frError(error))
    choose(n)
  }

  if (status === 'loading') return <div class="screen ath-screen"><p class="px muted center-msg">Chargement de la séance…</p></div>
  if (status === 'missing' || (status === 'error' && !session))
    return (
      <div class="screen ath-screen">
        <div class="px center-msg">
          <img src="/logo.png" alt="" width={120} height={120} />
          <h1>{status === 'missing' ? 'Séance introuvable' : 'Connexion impossible'}</h1>
          <p class="muted">{status === 'missing' ? `Le code ${code} ne correspond à aucune séance. Vérifie le lien envoyé par le coach.` : 'Vérifie ta connexion internet, puis recharge la page.'}</p>
        </div>
      </div>
    )

  const s = session!
  const header = (
    <header class="px ath-head">
      <div>
        <span class="label">{live ? '● En direct' : 'Séance terminée'} · {code}</span>
        <h1>{fmtDay(s.createdAt)} · {fmtHM(s.createdAt)}</h1>
      </div>
      <img src="/logo.png" alt="Torcy Canoë-Kayak" width={56} height={56} />
    </header>
  )

  // 1. Choix de l'identité
  if (!me) {
    return (
      <div class="screen ath-screen">
        {header}
        <div class="scroll px">
          <h2 class="ath-q">Qui es-tu ?</h2>
          {s.athletes.length > 0 && (
            <div class="chips">
              {s.athletes.map((a) => <button key={a.id} class="chip" onClick={() => choose(a.name)}>{label(a)}</button>)}
            </div>
          )}
          {live ? (
            <form class="join" onSubmit={join}>
              <span class="label">{s.athletes.length ? 'Pas dans la liste ? Inscris-toi' : 'Inscris-toi à la séance'}</span>
              <div class="field">
                <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Ton prénom" maxLength={40} autocapitalize="words" required />
                <input class="bib-in mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="Dossard" inputMode="numeric" aria-label="Ton numéro de dossard" />
                <button class="add" type="submit" disabled={joining} aria-label="Rejoindre">→</button>
              </div>
              {error && <p class="form-msg err" role="alert">{error}</p>}
            </form>
          ) : (
            <p class="muted">La séance est terminée : les inscriptions sont fermées.</p>
          )}
        </div>
      </div>
    )
  }

  // 2. Suivi en direct
  const run = mine?.openStart !== undefined
  const lastRun = mine?.runs[mine.runs.length - 1]
  return (
    <div class="screen ath-screen">
      {header}
      <div class="scroll">
        <section class="me px">
          <div class="me-top">
            <h2>{mine?.athlete.bib !== undefined && <span class="bibn mono big">{mine.athlete.bib}</span>}{me}</h2>
            <button class="link" onClick={() => { saveMe(code, null); setMe(null) }}>Pas moi</button>
          </div>
          {!mine ? (
            <p class="muted">Inscription envoyée. Tu apparaîtras dès que le téléphone du coach sera synchronisé…</p>
          ) : (
            <>
              <span class="label">{run ? 'En course' : mine.runs.length ? (live ? 'Arrivé' : 'Ton meilleur temps') : 'Pas encore parti'}</span>
              <div class="me-time mono">
                {run ? fmtDuration(now - mine.openStart!) : mine.best !== undefined ? fmtDuration(live && lastRun ? lastRun.time : mine.best) : '--:--.--'}
              </div>
              {run && mine.openSplits.length > 0 && (
                <div class="me-sub mono">{mine.openSplits.map((x, i) => `INT${i + 1} ${fmtDuration(x)}`).join(' · ')}</div>
              )}
              {myRank?.rank && (
                <div class="me-sub mono">
                  {myRank.rank}{myRank.rank === 1 ? 'er' : 'e'} · meilleur {fmtDuration(myRank.best!)}{myRank.gap ? ` · ${fmtGap(myRank.gap)}` : ''}
                </div>
              )}
              {mine.runs.length > 1 && (
                <ul class="me-runs">
                  {mine.runs.map((r, i) => (
                    <li key={i} class={r.time === mine.best ? 'best' : ''}>
                      <span>Passage {i + 1}</span>
                      <span class="mono">{fmtDuration(r.time)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <div class="cols label px" style={{ fontSize: 12 }}>
          <span>Rang</span><span>Athlète</span><span>{live ? 'Temps' : 'Meilleur'}</span>
        </div>
        <ol class="ranking dense">
          {rank.map((r) => {
            const running = r.openStart !== undefined
            return (
              <li key={r.athlete.id} class={`${r.rank === 1 ? 'first' : ''} ${mine?.athlete.id === r.athlete.id ? 'me-row' : ''}`}>
                <div class={`rank-row ${r.best === undefined && !running ? 'nt' : ''}`}>
                  <span class="rk">{r.rank ?? '–'}</span>
                  <span style={{ minWidth: 0 }}><span class="nm">{r.athlete.bib !== undefined && <span class="bibn mono">{r.athlete.bib}</span>}{r.athlete.name}</span></span>
                  <span>
                    <span class="tm">{running ? fmtDuration(now - r.openStart!) : r.best !== undefined ? fmtDuration(r.best) : '—'}</span>
                    {running ? <span class="gp">EN COURSE</span> : r.gap !== undefined && <span class="gp">{r.gap === 0 ? 'EN TÊTE' : fmtGap(r.gap)}</span>}
                  </span>
                  <span />
                </div>
              </li>
            )
          })}
        </ol>
        {status === 'error' && <p class="px muted">Connexion perdue · dernière mise à jour {fmtHM(lastSeen)}</p>}
      </div>
    </div>
  )
}
