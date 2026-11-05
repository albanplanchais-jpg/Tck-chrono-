-- TCK Chrono — commentaire de séance + chrono général (lancement des bateaux).
-- À exécuter après 0004_history_athletes.sql. Ré-exécutable sans risque.

alter table public.sessions add column if not exists comment text check (char_length(comment) <= 500);
alter table public.sessions add column if not exists general jsonb;

-- La page athlète affiche aussi le titre et le commentaire.
drop function if exists public.public_session(text);
create function public.public_session(p_code text)
returns table (code text, created_at timestamptz, ended_at timestamptz, splits int, athletes jsonb, taps jsonb, updated_at timestamptz, title text, comment text)
language sql stable security definer set search_path = '' as $$
  select s.code, s.created_at, s.ended_at, s.splits, s.athletes, public.merged_taps(s.id), s.updated_at, s.title, s.comment
  from public.sessions s
  where s.code = upper(btrim(p_code))
$$;
revoke all on function public.public_session(text) from public;
grant execute on function public.public_session(text) to anon, authenticated;
