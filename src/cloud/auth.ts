import { useEffect, useState } from 'preact/hooks'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!supabase)

  useEffect(() => {
    if (!supabase) return
    // getSession lit le stockage local : fonctionne hors ligne une fois connecté.
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  return { user, loading }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

/** Renvoie true si le compte est actif tout de suite, false si un e-mail de confirmation a été envoyé. */
export async function signUp(email: string, password: string, name: string, role: 'coach' | 'athlete' = 'coach'): Promise<boolean> {
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim(), role }, emailRedirectTo: location.origin }
  })
  if (error) throw error
  return !!data.session
}

export async function signOut() {
  await supabase?.auth.signOut()
}

export async function resetPassword(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
  if (error) throw error
}
