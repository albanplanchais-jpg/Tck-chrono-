import { useEffect, useMemo, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import { KIND_LABEL, type Kind } from '../core/model'
import { frError, joinUrl, supabase } from '../cloud/supabase'
import { Icon } from './Icon'

interface Props { code: string; sessionId: string; splits: number; onClose: () => void; /** Séance sans inter : en ajouter un si un chronométreur reçoit le droit INTER. */ onEnableSplits?: () => void }

interface Timer { id: string; token: string; roles: Kind[]; name: string | null; last_seen: string | null }

export const timerUrl = (token: string) => `${location.origin}/t/${token}`

function newToken(): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => a[b % a.length]).join('')
}

function Qr({ url }: { url: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
  }, [url])
  return <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
}

function ShareButtons({ url, text }: { url: string; text: string }) {
  const [msg, setMsg] = useState('')
  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: 'TCK Chrono', text, url })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Lien copié')
    } catch {
      setMsg(url)
    }
  }
  return (
    <>
      {msg && <p class="form-msg" role="status">{msg}</p>}
      <button class="btn primary" onClick={share}><Icon name="share" size={22} />Envoyer le lien</button>
      <a class="btn outline" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>
        <Icon name="chat" size={20} />WhatsApp
      </a>
    </>
  )
}

const ago = (iso: string | null) => {
  if (!iso) return 'pas encore connecté'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  return s < 15 ? 'en ligne' : s < 120 ? `vu il y a ${s} s` : `vu il y a ${Math.round(s / 60)} min`
}

/** Partage de la séance : lien athlètes (suivi + inscription) et liens chronométreurs (droits limités). */
export function ShareModal({ code, sessionId, splits, onClose, onEnableSplits }: Props) {
  const [tab, setTab] = useState<'athletes' | 'timers'>('athletes')
  const [timers, setTimers] = useState<Timer[]>([])
  const [roles, setRoles] = useState<Kind[]>(['finish'])
  const [shown, setShown] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const kinds: Kind[] = ['start', 'split', 'finish']

  const load = async () => {
    const { data, error } = await supabase!
      .from('session_timers')
      .select('id,token,roles,name,last_seen')
      .eq('session_id', sessionId)
      .order('created_at')
    if (error) setError(frError(error))
    else setTimers(data as Timer[])
  }

  useEffect(() => {
    if (tab !== 'timers' || !supabase) return
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [tab])

  const toggle = (k: Kind) => setRoles((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))

  const create = async () => {
    if (!roles.length) return setError('Choisis au moins un droit.')
    setBusy(true)
    setError('')
    if (roles.includes('split') && splits === 0) onEnableSplits?.()
    const token = newToken()
    const ordered = kinds.filter((k) => roles.includes(k))
    const { error } = await supabase!.from('session_timers').insert({ session_id: sessionId, token, roles: ordered })
    setBusy(false)
    if (error) return setError(/foreign key|violates/i.test(error.message) ? "La séance n'est pas encore en ligne : vérifie la connexion puis réessaie." : frError(error))
    await load()
    setShown(token)
  }

  const remove = async (t: Timer) => {
    await supabase!.from('session_timers').delete().eq('id', t.id)
    if (shown === t.token) setShown(null)
    load()
  }

  const shownTimer = timers.find((t) => t.token === shown)
  const rolesText = (r: Kind[]) => r.map((k) => KIND_LABEL[k]).join(' + ')

  return (
    <div class="modal-wrap" onClick={onClose}>
      <div class="modal share" role="dialog" aria-label="Partager la séance" onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>Partager</h2>
          <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>

        <div class="segment n2 tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'athletes'} class={tab === 'athletes' ? 'on' : ''} onClick={() => setTab('athletes')}>Athlètes</button>
          <button role="tab" aria-selected={tab === 'timers'} class={tab === 'timers' ? 'on' : ''} onClick={() => setTab('timers')}>Chronométreurs</button>
        </div>

        {tab === 'athletes' ? (
          <>
            <p>Les athlètes scannent le QR code ou ouvrent le lien : ils choisissent leur nom (ou s'inscrivent) et suivent leur chrono en direct.</p>
            <Qr url={joinUrl(code)} />
            <div class="share-code">
              <span class="label">Code</span>
              <span class="mono">{code}</span>
            </div>
            <ShareButtons url={joinUrl(code)} text="Rejoins la séance chrono TCK :" />
          </>
        ) : shownTimer ? (
          <>
            <p>
              Lien pour <b>{shownTimer.name ?? 'un chronométreur'}</b> · droits : <b>{rolesText(shownTimer.roles)}</b>. La personne
              ouvre le lien, entre son nom, et ne voit que ses boutons.
            </p>
            <Qr url={timerUrl(shownTimer.token)} />
            <ShareButtons url={timerUrl(shownTimer.token)} text={`Tu es chronométreur (${rolesText(shownTimer.roles)}) sur la séance TCK :`} />
            <button class="link" onClick={() => setShown(null)}>← Tous les chronométreurs</button>
          </>
        ) : (
          <>
            <p>Ajoute une personne qui chronomètre sur son téléphone, par exemple au départ pendant que tu es à l'arrivée. Les horloges sont synchronisées automatiquement.</p>

            {timers.length > 0 && (
              <ul class="timers">
                {timers.map((t) => (
                  <li key={t.id}>
                    <span class="tm-info">
                      <b>{t.name ?? 'En attente du nom…'}</b>
                      <small class="mono">{rolesText(t.roles)} · {ago(t.last_seen)}</small>
                    </span>
                    <button class="pill outline" onClick={() => setShown(t.token)}>Lien</button>
                    <button class="rm" onClick={() => remove(t)} aria-label={`Retirer ${t.name ?? 'ce chronométreur'}`}><Icon name="x" size={18} /></button>
                  </li>
                ))}
              </ul>
            )}

            <span class="label white">Nouveau chronométreur · ses droits</span>
            <div class={`segment n${kinds.length} multi-sel`} role="group">
              {kinds.map((k) => (
                <button key={k} aria-pressed={roles.includes(k)} class={roles.includes(k) ? 'on' : ''} onClick={() => toggle(k)}>
                  {roles.includes(k) && <Icon name="check" size={14} stroke={3.4} />} {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {splits === 0 && roles.includes('split') && (
              <p class="form-msg">La séance n'a pas de chrono inter : un inter sera ajouté pour tout le monde.</p>
            )}
            {error && <p class="form-msg err" role="alert">{error}</p>}
            <button class="btn primary" disabled={busy || !roles.length} onClick={create}>
              <Icon name="plus" size={20} />Créer le lien chronométreur
            </button>
          </>
        )}
      </div>
    </div>
  )
}
