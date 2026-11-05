export type Kind = 'start' | 'split' | 'finish'

export interface Athlete {
  id: string
  name: string
  /** Numéro de dossard. */
  bib?: number
  /** Part en même temps que l'athlète précédent dans l'ordre de départ (même vague). */
  withPrev?: boolean
  /** Infos FFCK (si choisi dans la liste des licenciés). */
  licence?: string
  club?: string
  categorie?: string
  embarcation?: string
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

/** Parcours de référence (ex. « Bassin 500 m ») : records et classement par parcours. */
export interface Course {
  id: string
  name: string
  /** Longueur en mètres. */
  distance?: number
  /** Nombre d'inters habituel sur ce parcours. */
  splits?: number
  notes?: string
}

export interface Session {
  id: string
  createdAt: number
  endedAt?: number
  athletes: Athlete[]
  taps: Tap[]
  /** Nombre de chronos intermédiaires attendus par passage (0 = aucun). */
  splits?: number
  /** Parcours sur lequel la séance a été faite. */
  courseId?: string
  /** Coach qui a chronométré (séances partagées). Absent = séance de ce téléphone. */
  coachId?: string
  coachName?: string
  /** Titre libre (ex. « Bassin · 6 × 1 min »). */
  title?: string
  /** Commentaire libre (ex. « beaucoup de vent »). */
  comment?: string
  /** Chrono général pour lancer les bateaux : départ (heure commune, ms) et intervalle (s). */
  general?: { start?: number; interval?: number }
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
