import { useState } from 'preact/hooks'
import { Icon } from './Icon'

const IDEAS = ['Beaucoup de vent', 'Eau calme', 'Courant fort', 'Pluie', 'Froid', 'Séance test']

/** Nom et commentaire de la séance (modifiables pendant, après, et depuis l'historique). */
export function SessionInfo({ title, comment, onSave, onClose }: {
  title?: string
  comment?: string
  onSave: (v: { title: string; comment: string }) => void | Promise<void>
  onClose: () => void
}) {
  const [t, setT] = useState(title ?? '')
  const [c, setC] = useState(comment ?? '')
  const [busy, setBusy] = useState(false)
  const add = (idea: string) => setC((x) => (x.toLowerCase().includes(idea.toLowerCase()) ? x : x.trim() ? `${x.trim()} · ${idea.toLowerCase()}` : idea))

  const save = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    try { await onSave({ title: t.trim().slice(0, 80), comment: c.trim().slice(0, 500) }) } finally { setBusy(false) }
  }

  return (
    <div class="modal-wrap" onClick={onClose}>
      <form class="modal login-form info" onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>Infos de la séance</h2>
          <button type="button" class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>
        <label>
          <span class="label">Nom de la séance</span>
          <input value={t} onInput={(e) => setT((e.target as HTMLInputElement).value)} placeholder="Bassin · 6 × 1 min" maxLength={80} />
        </label>
        <label>
          <span class="label">Commentaire</span>
          <textarea value={c} onInput={(e) => setC((e.target as HTMLTextAreaElement).value)} placeholder="Conditions, ressenti, matériel…" maxLength={500} rows={4} />
        </label>
        <div class="chips ideas">
          {IDEAS.map((i) => <button type="button" key={i} class="chip" onClick={() => add(i)}>+ {i}</button>)}
        </div>
        <button class="btn primary" type="submit" disabled={busy}>Enregistrer</button>
      </form>
    </div>
  )
}
