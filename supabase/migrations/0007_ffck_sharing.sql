-- TCK Chrono — licenciés FFCK, comptes athlètes, partage des chronos entre comptes connectés.
-- À exécuter après 0006_courses.sql. Ré-exécutable sans risque.
--
-- Règles de confidentialité appliquées ici :
--   • la liste des licenciés n'est lisible QUE par les coachs validés (table coach_approvals) ;
--   • un athlète ne peut vérifier que SA licence (claim_licence) ;
--   • les séances sont lisibles par les comptes connectés de l'app, jamais publiquement ;
--   • la liste d'opposition empêche définitivement la réimportation d'un licencié.

-- ───────────── Normalisation (comparaison sans accents ni casse) ─────────────
create or replace function public.norm(t text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(coalesce(t, ''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿŒœÆæ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyOoAa'))
$$;

-- ───────────── Licenciés FFCK (écrits uniquement par la synchro, clé de service) ─────────────
create table if not exists public.licensees (
  licence         text primary key,
  nom             text not null,
  prenom          text not null,
  club            text,
  categorie       text,
  embarcation     text,
  active          boolean not null default true,
  first_seen      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  inactive_since  timestamptz
);
alter table public.licensees enable row level security;   -- aucune policy : illisible depuis l'app

-- Liste d'opposition : jamais réimportés, même si la FFCK les renvoie.
create table if not exists public.ffck_oppositions (
  licence     text primary key,
  created_at  timestamptz not null default now(),
  note        text
);
alter table public.ffck_oppositions enable row level security;   -- gérée depuis le tableau de bord Supabase

-- ───────────── Comptes : rôle coach / athlète ─────────────
create table if not exists public.profiles (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  role        text not null default 'coach' check (role in ('coach', 'athlete')),
  name        text check (char_length(name) <= 60),
  club        text check (char_length(club) <= 80),
  licence     text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own_profile_select" on public.profiles;
drop policy if exists "own_profile_insert" on public.profiles;
drop policy if exists "own_profile_update" on public.profiles;
create policy "own_profile_select" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own_profile_insert" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
-- La licence ne se renseigne que via claim_licence() (vérifiée), pas en écriture directe.
create policy "own_profile_update" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- (Privilèges par colonne : un droit sur toute la table couvrirait aussi « licence ».)
revoke insert, update on public.profiles from authenticated;
grant insert (user_id, role, name, club) on public.profiles to authenticated;
grant update (role, name, club, updated_at) on public.profiles to authenticated;

-- Coachs validés (accès à la liste FFCK). Ajout manuel :
--   insert into public.coach_approvals (user_id, note) select id, 'coach Torcy' from auth.users where email = '…';
create table if not exists public.coach_approvals (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  approved_at  timestamptz not null default now(),
  note         text
);
alter table public.coach_approvals enable row level security;
drop policy if exists "own_approval_select" on public.coach_approvals;
create policy "own_approval_select" on public.coach_approvals for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_approved_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coach_approvals where user_id = auth.uid())
$$;
revoke all on function public.is_approved_coach() from public;
grant execute on function public.is_approved_coach() to authenticated;

-- ───────────── Fichier licencies.json.gz : stockage privé ─────────────
insert into storage.buckets (id, name, public) values ('ffck', 'ffck', false) on conflict (id) do nothing;
drop policy if exists "ffck_read_approved_coaches" on storage.objects;
create policy "ffck_read_approved_coaches" on storage.objects for select to authenticated
  using (bucket_id = 'ffck' and public.is_approved_coach());

-- ───────────── Partage des chronos ─────────────
alter table public.sessions add column if not exists coach_name text check (char_length(coach_name) <= 60);
create index if not exists sessions_athletes_gin on public.sessions using gin (athletes jsonb_path_ops);

-- Tous les comptes connectés voient les séances et les parcours (en lecture). Écriture : le coach seulement.
drop policy if exists "connected_read_sessions" on public.sessions;
create policy "connected_read_sessions" on public.sessions for select to authenticated using (true);
drop policy if exists "connected_read_courses" on public.courses;
create policy "connected_read_courses" on public.courses for select to authenticated using (true);

-- Infos FFCK gardées avec les athlètes du groupe.
alter table public.athletes add column if not exists licence text;
alter table public.athletes add column if not exists club text;
alter table public.athletes add column if not exists categorie text;
alter table public.athletes add column if not exists embarcation text;

-- ───────────── Comptes athlètes ─────────────
-- Relie le compte connecté à SA licence : il faut le n° de licence ET le nom de famille.
create or replace function public.claim_licence(p_licence text, p_nom text)
returns table (licence text, nom text, prenom text, club text, categorie text, embarcation text)
language plpgsql security definer set search_path = '' as $$
declare l public.licensees;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into l from public.licensees x
   where x.licence = btrim(p_licence) and public.norm(x.nom) = public.norm(btrim(p_nom));
  if l.licence is null then raise exception 'Licence introuvable : vérifie le numéro et le nom de famille'; end if;
  insert into public.profiles (user_id, role, name, club, licence)
  values (auth.uid(), 'athlete', l.prenom || ' ' || l.nom, l.club, l.licence)
  on conflict (user_id) do update set licence = excluded.licence, name = excluded.name, club = excluded.club, updated_at = now();
  return query select l.licence, l.nom, l.prenom, l.club, l.categorie, l.embarcation;
end
$$;
revoke all on function public.claim_licence(text, text) from public;
grant execute on function public.claim_licence(text, text) to authenticated;

-- Séances où apparaît l'athlète connecté (par licence, sinon par nom).
create or replace function public.my_sessions()
returns setof public.sessions
language sql stable security invoker set search_path = '' as $$
  select s.* from public.sessions s, public.profiles p
  where p.user_id = auth.uid()
    and (
      (p.licence is not null and s.athletes @> jsonb_build_array(jsonb_build_object('licence', p.licence)))
      or exists (select 1 from jsonb_array_elements(s.athletes) a where public.norm(a->>'name') = public.norm(p.name))
    )
  order by s.created_at desc
  limit 300
$$;
revoke all on function public.my_sessions() from public;
grant execute on function public.my_sessions() to authenticated;
