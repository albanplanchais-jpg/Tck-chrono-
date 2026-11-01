import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null si Supabase n'est pas configuré : l'app fonctionne alors en local, sans compte. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

export const cloudEnabled = supabase !== null

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0/O, 1/I
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const joinUrl = (code: string) => `${location.origin}/s/${code}`

/** Messages d'erreur Supabase traduits pour l'écran. */
export function frError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton e-mail (lien reçu par mail)."
  if (/User already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.'
  if (/Password should be at least/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).'
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessaie dans quelques minutes.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion internet.'
  return m
}
