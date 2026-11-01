export type Kind = 'start' | 'finish'

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
}

export interface Session {
  id: string
  createdAt: number
  endedAt?: number
  athletes: Athlete[]
  taps: Tap[]
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
