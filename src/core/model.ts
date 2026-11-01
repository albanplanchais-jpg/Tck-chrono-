export type Kind = 'start' | 'split' | 'finish'

export interface Athlete {
  id: string
  name: string
}

/** Un tap = un instant capturé. Les temps sont toujours recalculés à partir des taps. */
export interface Tap {
  id: string
  t: number // epoch ms (précision sub-ms possible)
  athleteId?: string
  kind?: Kind
  voided?: boolean
  /** Nom du chronométreur qui a pris ce tap (absent = le coach). */
  by?: string
}

export interface Session {
  id: string
  createdAt: number
  endedAt?: number
  athletes: Athlete[]
  taps: Tap[]
  /** Nombre de chronos intermédiaires attendus par passage (0 = aucun). */
  splits?: number
  /** Code à 6 caractères du lien athlète (séance synchronisée en ligne). */
  code?: string
  /** Version déjà intégrée de chaque tap de chronométreur (id → updated_at). */
  remoteSeen?: Record<string, string>
}

export const KIND_LABEL: Record<Kind, string> = { start: 'DÉPART', split: 'INTER', finish: 'ARRIVÉE' }

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
