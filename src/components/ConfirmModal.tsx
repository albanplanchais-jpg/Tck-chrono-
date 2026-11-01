interface Props { athletes: number; running: number; passages: number; onConfirm: () => void; onCancel: () => void }

export function ConfirmModal({ athletes, running, passages, onConfirm, onCancel }: Props) {
  return (
    <div class="modal-wrap" onClick={onCancel}>
      <div class="modal" role="alertdialog" aria-labelledby="mt" onClick={(e) => e.stopPropagation()}>
        <h2 id="mt">Terminer la séance ?</h2>
        <p>
          {running > 0
            ? `${running} athlète${running > 1 ? 's sont' : ' est'} encore en course. ${running > 1 ? 'Leurs chronos' : 'Son chrono'} en cours ne ${running > 1 ? 'seront' : 'sera'} pas enregistré${running > 1 ? 's' : ''}.`
            : 'Tous les chronos sont arrêtés. Place au classement.'}
        </p>
        <div class="stats">
          <div><b>{athletes}</b><span>Athlètes</span></div>
          <div><b>{running}</b><span>En course</span></div>
          <div><b>{passages}</b><span>Passages</span></div>
        </div>
        <button class="btn primary" onClick={onConfirm}>Terminer</button>
        <button class="btn outline" onClick={onCancel}>Continuer le chrono</button>
      </div>
    </div>
  )
}
