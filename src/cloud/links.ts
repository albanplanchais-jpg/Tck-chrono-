import { supabase } from './supabase'

/** Licencié trouvé par « Retrouve-toi » (nom complet + début du prénom). */
export interface FoundLicensee { licence: string; nom: string; prenom: string; club: string | null; categorie: string | null; embarcation: string | null }
/** Compte de l'autre côté (coach pour un athlète, athlète pour un coach). */
export interface Account { user_id: string; name: string; club: string | null; licence: string | null; linked?: 'pending' | 'accepted' | null }
export interface Link extends Account { status: 'pending' | 'accepted'; incoming: boolean }

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('Pas de connexion au serveur')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const findLicensee = (nom: string, prenom: string) => call<FoundLicensee[]>('find_licensee', { p_nom: nom.trim(), p_prenom: prenom.trim() })

/** Jeton de la session connectée (pour la fonction /api/licensees). */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Recherche dans le classement descente via la fonction Vercel (quand la base n'est pas encore remplie). */
export async function findLicenseeApi(nom: string, prenom: string): Promise<FoundLicensee[]> {
  const token = await accessToken()
  if (!token) return []
  const q = new URLSearchParams({ nom: nom.trim(), prenom: prenom.trim() })
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const r = await fetch(`/api/licensees?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    if (!r.ok || !/json/.test(r.headers.get('content-type') ?? '')) return []
    const body = await r.json()
    return Array.isArray(body?.rows) ? body.rows : []
  } catch { return [] } finally { clearTimeout(t) }
}
export const claimLicenceListed = (l: FoundLicensee) =>
  call<FoundLicensee[]>('claim_licence_listed', { p_licence: l.licence, p_nom: l.nom, p_prenom: l.prenom, p_club: l.club ?? '' })
export const claimLicence = (licence: string, nom: string) => call<FoundLicensee[]>('claim_licence', { p_licence: licence.trim(), p_nom: nom.trim() })
export const findAccounts = (q: string) => call<Account[]>('find_accounts', { p_q: q.trim() })
export const requestLink = (id: string) => call<'pending' | 'accepted'>('request_link', { p_other: id })
export const answerLink = (id: string, accept: boolean) => call<void>('answer_link', { p_other: id, p_accept: accept })
export const removeLink = (id: string) => call<void>('remove_link', { p_other: id })
export const myLinks = () => call<Link[]>('my_links')
export const linkSuggestions = () => call<Account[]>('link_suggestions')
