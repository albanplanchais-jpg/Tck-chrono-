import { useMemo, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import { joinUrl } from '../cloud/supabase'
import { Icon } from './Icon'

/** Lien + QR code pour que les athlètes rejoignent la séance. */
export function ShareModal({ code, onClose }: { code: string; onClose: () => void }) {
  const url = joinUrl(code)
  const [msg, setMsg] = useState('')
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
  }, [url])

  const share = async () => {
    const text = `Rejoins la séance chrono TCK : ${url}`
    try {
      if (navigator.share) return await navigator.share({ title: 'Séance TCK Chrono', text, url })
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
    <div class="modal-wrap" onClick={onClose}>
      <div class="modal share" role="dialog" aria-label="Lien de la séance" onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>Lien athlètes</h2>
          <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>
        <p>Les athlètes scannent le QR code ou ouvrent le lien : ils choisissent leur nom (ou s'inscrivent) et suivent leur chrono en direct.</p>
        <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div class="share-code">
          <span class="label">Code</span>
          <span class="mono">{code}</span>
        </div>
        {msg && <p class="form-msg" role="status">{msg}</p>}
        <button class="btn primary" onClick={share}><Icon name="share" size={22} />Envoyer le lien</button>
        <a class="btn outline" href={`https://wa.me/?text=${encodeURIComponent(`Rejoins la séance chrono TCK : ${url}`)}`}>
          <Icon name="chat" size={20} />WhatsApp
        </a>
      </div>
    </div>
  )
}
