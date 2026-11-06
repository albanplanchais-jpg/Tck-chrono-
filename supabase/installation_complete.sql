-- ============================================================
-- TCK Chrono — installation / mise à jour COMPLÈTE de la base
-- À coller en une seule fois dans Supabase → SQL Editor → New query → Run.
-- Ré-exécutable sans risque (déjà fait = ignoré).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0001_init.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — schéma initial
-- Séances des coachs (synchronisées depuis l'app) + inscriptions des athlètes par lien.

-- ───────────── Séances ─────────────
create table if not exists public.sessions (
  id          uuid primary key,
  coach_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  splits      int  not null default 0 check (splits between 0 and 3),
  athletes    jsonb not null default '[]'::jsonb,  -- [{id, name}]
  taps        jsonb not null default '[]'::jsonb,  -- [{id, t, athleteId?, kind?, voided?}]
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_coach_idx on public.sessions (coach_id, created_at desc);

alter table public.sessions enable row level security;

-- Le coach ne voit et ne modifie que ses propres séances.
drop policy if exists "coach_select_own" on public.sessions;
drop policy if exists "coach_insert_own" on public.sessions;
drop policy if exists "coach_update_own" on public.sessions;
drop policy if exists "coach_delete_own" on public.sessions;
create policy "coach_select_own" on public.sessions for select to authenticated using (coach_id = (select auth.uid()));
create policy "coach_insert_own" on public.sessions for insert to authenticated with check (coach_id = (select auth.uid()));
create policy "coach_update_own" on public.sessions for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "coach_delete_own" on public.sessions for delete to authenticated using (coach_id = (select auth.uid()));

-- ───────────── Inscriptions athlètes (via le lien) ─────────────
create table if not exists public.session_joins (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);
create index if not exists session_joins_session_idx on public.session_joins (session_id);

alter table public.session_joins enable row level security;

drop policy if exists "coach_reads_joins" on public.session_joins;
create policy "coach_reads_joins" on public.session_joins for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.coach_id = (select auth.uid())));
-- Pas de policy insert : les athlètes passent uniquement par join_session().

-- ───────────── Accès public par code (sans compte) ─────────────
-- (Supprimée d'abord : une version plus récente, avec d'autres colonnes, peut déjà exister — fichier 0005.)
drop function if exists public.public_session(text);
create or replace function public.public_session(p_code text)
returns table (code text, created_at timestamptz, ended_at timestamptz, splits int, athletes jsonb, taps jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.code, s.created_at, s.ended_at, s.splits, s.athletes, s.taps, s.updated_at
  from public.sessions s
  where s.code = upper(btrim(p_code))
$$;

create or replace function public.join_session(p_code text, p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  jid uuid;
  n   text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 1 or char_length(n) > 40 then
    raise exception 'Nom invalide';
  end if;
  select id into sid from public.sessions where code = upper(btrim(p_code)) and ended_at is null;
  if sid is null then
    raise exception 'Séance introuvable ou terminée';
  end if;
  select id into jid from public.session_joins where session_id = sid and lower(name) = lower(n);
  if jid is not null then
    return jid;
  end if;
  if (select count(*) from public.session_joins where session_id = sid) >= 100 then
    raise exception 'Séance complète';
  end if;
  insert into public.session_joins (session_id, name) values (sid, n) returning id into jid;
  return jid;
end
$$;

revoke all on function public.public_session(text) from public;
revoke all on function public.join_session(text, text) from public;
grant execute on function public.public_session(text) to anon, authenticated;
grant execute on function public.join_session(text, text) to anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 0002_timekeepers.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — chronométreurs invités par lien + horloge serveur commune.
-- À exécuter après 0001_init.sql. Ré-exécutable sans risque.

-- ───────────── Chronométreurs invités ─────────────
create table if not exists public.session_timers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  token       text not null unique check (char_length(token) >= 16),
  roles       text[] not null check (cardinality(roles) > 0 and roles <@ array['start','split','finish']),
  name        text check (char_length(name) <= 40),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);
create index if not exists session_timers_session_idx on public.session_timers (session_id);
alter table public.session_timers enable row level security;

drop policy if exists "coach_manages_timers" on public.session_timers;
create policy "coach_manages_timers" on public.session_timers for all to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.coach_id = (select auth.uid())))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.coach_id = (select auth.uid())));

-- ───────────── Taps envoyés par les chronométreurs ─────────────
create table if not exists public.remote_taps (
  id          uuid primary key,                 -- généré par le téléphone (renvoi sans doublon)
  session_id  uuid not null references public.sessions(id) on delete cascade,
  timer_id    uuid not null references public.session_timers(id) on delete cascade,
  t           double precision not null,        -- heure serveur, en ms
  athlete_id  text not null,
  kind        text not null check (kind in ('start','split','finish')),
  voided      boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists remote_taps_session_idx on public.remote_taps (session_id);
alter table public.remote_taps enable row level security;

drop policy if exists "coach_reads_remote_taps" on public.remote_taps;
create policy "coach_reads_remote_taps" on public.remote_taps for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.coach_id = (select auth.uid())));

-- ───────────── Horloge commune ─────────────
create or replace function public.server_time()
returns double precision
language sql volatile set search_path = '' as $$
  select extract(epoch from clock_timestamp()) * 1000
$$;

-- Taps de la séance = ceux du coach + ceux des chronométreurs pas encore intégrés par le coach.
-- (Une fois intégré, c'est la version du coach — éventuellement corrigée — qui fait foi.)
create or replace function public.merged_taps(p_session uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select s.taps || coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 't', r.t, 'athleteId', r.athlete_id, 'kind', r.kind, 'voided', r.voided, 'by', coalesce(tm.name, 'Chronométreur')
    ) order by r.t)
    from public.remote_taps r
    join public.session_timers tm on tm.id = r.timer_id
    where r.session_id = s.id
      and not exists (select 1 from jsonb_array_elements(s.taps) x where x->>'id' = r.id::text)
  ), '[]'::jsonb)
  from public.sessions s
  where s.id = p_session
$$;

-- La page athlète voit aussi les taps des chronométreurs.
-- (Supprimée d'abord : une version plus récente, avec d'autres colonnes, peut déjà exister — fichier 0005.)
drop function if exists public.public_session(text);
create or replace function public.public_session(p_code text)
returns table (code text, created_at timestamptz, ended_at timestamptz, splits int, athletes jsonb, taps jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.code, s.created_at, s.ended_at, s.splits, s.athletes, public.merged_taps(s.id), s.updated_at
  from public.sessions s
  where s.code = upper(btrim(p_code))
$$;

-- Séance vue par un chronométreur (via son lien secret).
create or replace function public.timer_session(p_token text)
returns table (
  code text, created_at timestamptz, ended_at timestamptz, splits int, athletes jsonb, taps jsonb,
  roles text[], timer_id uuid, timer_name text
)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.session_timers set last_seen = now() where token = p_token;
  return query
    select s.code, s.created_at, s.ended_at, s.splits, s.athletes, public.merged_taps(s.id), tm.roles, tm.id, tm.name
    from public.session_timers tm
    join public.sessions s on s.id = tm.session_id
    where tm.token = p_token;
end
$$;

create or replace function public.claim_timer(p_token text, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 1 or char_length(n) > 40 then raise exception 'Nom invalide'; end if;
  update public.session_timers set name = n, last_seen = now() where token = p_token;
  if not found then raise exception 'Lien chronométreur invalide'; end if;
end
$$;

-- Enregistre (ou annule) un tap d'un chronométreur, dans la limite de ses droits.
create or replace function public.timer_tap(p_token text, p_tap jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  tm   public.session_timers;
  ended timestamptz;
  k    text := p_tap->>'kind';
  t    double precision := (p_tap->>'t')::double precision;
begin
  select * into tm from public.session_timers where token = p_token;
  if tm.id is null then raise exception 'Lien chronométreur invalide'; end if;
  select ended_at into ended from public.sessions where id = tm.session_id;
  if ended is not null then raise exception 'Séance terminée'; end if;
  if not (k = any (tm.roles)) then raise exception 'Ce chronométreur n''a pas le droit : %', k; end if;
  if t is null or abs(t - extract(epoch from clock_timestamp()) * 1000) > 86400000 then raise exception 'Heure invalide'; end if;

  insert into public.remote_taps (id, session_id, timer_id, t, athlete_id, kind, voided, updated_at)
  values ((p_tap->>'id')::uuid, tm.session_id, tm.id, t, p_tap->>'athleteId', k, coalesce((p_tap->>'voided')::boolean, false), now())
  on conflict (id) do update
    set athlete_id = excluded.athlete_id, kind = excluded.kind, voided = excluded.voided, updated_at = now()
    where public.remote_taps.timer_id = tm.id;
  update public.session_timers set last_seen = now() where id = tm.id;
end
$$;

revoke all on function public.merged_taps(uuid) from public, anon, authenticated;
revoke all on function public.server_time() from public;
revoke all on function public.timer_session(text) from public;
revoke all on function public.claim_timer(text, text) from public;
revoke all on function public.timer_tap(text, jsonb) from public;
grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.public_session(text) to anon, authenticated;
grant execute on function public.timer_session(text) to anon, authenticated;
grant execute on function public.claim_timer(text, text) to anon, authenticated;
grant execute on function public.timer_tap(text, jsonb) to anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 0003_bibs.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — dossard saisi par l'athlète quand il rejoint la séance par le lien.
-- À exécuter après 0002_timekeepers.sql. Ré-exécutable sans risque.

alter table public.session_joins add column if not exists bib int check (bib between 0 and 99999);

drop function if exists public.join_session(text, text);

create or replace function public.join_session(p_code text, p_name text, p_bib int default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  jid uuid;
  n   text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 1 or char_length(n) > 40 then
    raise exception 'Nom invalide';
  end if;
  if p_bib is not null and (p_bib < 0 or p_bib > 99999) then
    raise exception 'Dossard invalide';
  end if;
  select id into sid from public.sessions where code = upper(btrim(p_code)) and ended_at is null;
  if sid is null then
    raise exception 'Séance introuvable ou terminée';
  end if;
  select id into jid from public.session_joins where session_id = sid and lower(name) = lower(n);
  if jid is not null then
    if p_bib is not null then update public.session_joins set bib = p_bib where id = jid; end if;
    return jid;
  end if;
  if (select count(*) from public.session_joins where session_id = sid) >= 100 then
    raise exception 'Séance complète';
  end if;
  insert into public.session_joins (session_id, name, bib) values (sid, n, p_bib) returning id into jid;
  return jid;
end
$$;

revoke all on function public.join_session(text, text, int) from public;
grant execute on function public.join_session(text, text, int) to anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 0004_history_athletes.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — groupe d'athlètes du coach + titre des séances (historique).
-- À exécuter après 0003_bibs.sql. Ré-exécutable sans risque.

-- Titre libre de la séance (ex. « Bassin · 6 × 1 min »).
alter table public.sessions add column if not exists title text check (char_length(title) <= 80);

-- ───────────── Athlètes du coach (« Mon groupe ») ─────────────
-- L'id est le même que dans les séances (sessions.athletes[].id) : les temps
-- de chaque séance sont ainsi rattachés à l'athlète d'une séance à l'autre.
create table if not exists public.athletes (
  id          uuid primary key,
  coach_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  bib         int check (bib between 0 and 99999),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists athletes_coach_idx on public.athletes (coach_id, archived);

alter table public.athletes enable row level security;

drop policy if exists "coach_select_athletes" on public.athletes;
drop policy if exists "coach_insert_athletes" on public.athletes;
drop policy if exists "coach_update_athletes" on public.athletes;
drop policy if exists "coach_delete_athletes" on public.athletes;
create policy "coach_select_athletes" on public.athletes for select to authenticated using (coach_id = (select auth.uid()));
create policy "coach_insert_athletes" on public.athletes for insert to authenticated with check (coach_id = (select auth.uid()));
create policy "coach_update_athletes" on public.athletes for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "coach_delete_athletes" on public.athletes for delete to authenticated using (coach_id = (select auth.uid()));


-- ────────────────────────────────────────────────────────────
-- 0005_comment_general.sql
-- ────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────
-- 0006_courses.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — parcours de référence (records et classements par parcours).
-- À exécuter après 0005_comment_general.sql. Ré-exécutable sans risque.

create table if not exists public.courses (
  id          uuid primary key,
  coach_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  distance    int check (distance between 1 and 1000000),   -- mètres
  splits      int not null default 0 check (splits between 0 and 3),
  notes       text check (char_length(notes) <= 300),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists courses_coach_idx on public.courses (coach_id, archived);
alter table public.courses enable row level security;

drop policy if exists "coach_select_courses" on public.courses;
drop policy if exists "coach_insert_courses" on public.courses;
drop policy if exists "coach_update_courses" on public.courses;
drop policy if exists "coach_delete_courses" on public.courses;
create policy "coach_select_courses" on public.courses for select to authenticated using (coach_id = (select auth.uid()));
create policy "coach_insert_courses" on public.courses for insert to authenticated with check (coach_id = (select auth.uid()));
create policy "coach_update_courses" on public.courses for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "coach_delete_courses" on public.courses for delete to authenticated using (coach_id = (select auth.uid()));

-- Séance faite sur un parcours (facultatif).
alter table public.sessions add column if not exists course_id uuid references public.courses(id) on delete set null;
create index if not exists sessions_course_idx on public.sessions (course_id);


-- ────────────────────────────────────────────────────────────
-- 0007_ffck_sharing.sql
-- ────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────
-- 0008_session_modes.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — type de séance (classique / mass start / poursuite) et plan de poursuite.
-- À exécuter après 0007_ffck_sharing.sql. Ré-exécutable sans risque.
alter table public.sessions add column if not exists mode text check (mode in ('classic', 'mass', 'pursuit'));
alter table public.sessions add column if not exists pursuit jsonb;


-- ────────────────────────────────────────────────────────────
-- 0009_links.sql
-- ────────────────────────────────────────────────────────────
-- TCK Chrono — lien coach ↔ athlète, et « se retrouver » dans la liste des licenciés à l'inscription.
-- À exécuter après 0008_session_modes.sql. Ré-exécutable sans risque.
--
-- Confidentialité :
--   • la table des liens n'est lisible qu'au travers des fonctions ci-dessous (aucune policy directe) ;
--   • un lien n'existe qu'une fois ACCEPTÉ par l'autre personne (demande → acceptation) ;
--   • la recherche de licencié pour un athlète exige le NOM DE FAMILLE COMPLET + le début du prénom,
--     et renvoie au plus 5 personnes (pas de parcours de la liste) ;
--   • les recherches de comptes ne renvoient que nom, club (et licence côté coach), 10 au plus.

-- ───────────── Nom et rôle d'un compte (profil, sinon infos d'inscription) ─────────────
create or replace function public.account_info(p_uid uuid)
returns table (name text, role text, club text, licence text)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.name, u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
         coalesce(p.role, u.raw_user_meta_data->>'role', 'coach'),
         coalesce(p.club, u.raw_user_meta_data->>'club'),
         p.licence
  from auth.users u left join public.profiles p on p.user_id = u.id
  where u.id = p_uid
$$;
revoke all on function public.account_info(uuid) from public, anon, authenticated;

-- ───────────── Se retrouver dans la liste des licenciés ─────────────
create or replace function public.find_licensee(p_nom text, p_prenom text)
returns table (licence text, nom text, prenom text, club text, categorie text, embarcation text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if char_length(btrim(coalesce(p_nom, ''))) < 2 or char_length(btrim(coalesce(p_prenom, ''))) < 2 then
    raise exception 'Indique ton nom de famille complet et au moins 2 lettres du prénom';
  end if;
  return query
    select l.licence, l.nom, l.prenom, l.club, l.categorie, l.embarcation
    from public.licensees l
    where l.active
      and public.norm(l.nom) = public.norm(btrim(p_nom))
      and public.norm(l.prenom) like public.norm(btrim(p_prenom)) || '%'
    order by l.prenom, l.club
    limit 5;
end
$$;
revoke all on function public.find_licensee(text, text) from public, anon;
grant execute on function public.find_licensee(text, text) to authenticated;

-- ───────────── Liens coach ↔ athlète ─────────────
create table if not exists public.coach_links (
  coach_id      uuid not null references auth.users(id) on delete cascade,
  athlete_id    uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_by  uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);
create index if not exists coach_links_athlete_idx on public.coach_links (athlete_id);
alter table public.coach_links enable row level security;   -- aucune policy : accès par les fonctions

-- Rôle du compte connecté.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.account_info(auth.uid())
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Chercher l'autre côté : un athlète cherche des coachs, un coach cherche des comptes athlètes.
create or replace function public.find_accounts(p_q text)
returns table (user_id uuid, name text, club text, licence text, linked text)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); my text; want text; q text := public.norm(btrim(coalesce(p_q, '')));
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if char_length(q) < 2 then return; end if;
  my := (select i.role from public.account_info(me) i);
  want := case when my = 'athlete' then 'coach' else 'athlete' end;
  return query
    select u.id, i.name, i.club,
           case when my = 'coach' then i.licence end,
           (select c.status from public.coach_links c
             where (c.coach_id = me and c.athlete_id = u.id) or (c.athlete_id = me and c.coach_id = u.id))
    from auth.users u
    cross join lateral public.account_info(u.id) i
    where u.id <> me and i.role = want
      and (public.norm(i.name) like '%' || q || '%' or (my = 'coach' and i.licence = btrim(p_q)))
    order by i.name
    limit 10;
end
$$;
revoke all on function public.find_accounts(text) from public, anon;
grant execute on function public.find_accounts(text) to authenticated;

-- Demander un lien (ou accepter directement si l'autre l'avait déjà demandé).
create or replace function public.request_link(p_other uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my text; other text; c uuid; a uuid; cur public.coach_links;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  my := (select i.role from public.account_info(me) i);
  other := (select i.role from public.account_info(p_other) i);
  if other is null then raise exception 'Compte introuvable'; end if;
  if my = other then raise exception 'Un lien relie un coach et un athlète'; end if;
  if my = 'coach' then c := me; a := p_other; else c := p_other; a := me; end if;
  select * into cur from public.coach_links where coach_id = c and athlete_id = a;
  if cur.coach_id is null then
    insert into public.coach_links (coach_id, athlete_id, requested_by) values (c, a, me);
    return 'pending';
  elsif cur.status = 'pending' and cur.requested_by <> me then
    update public.coach_links set status = 'accepted', accepted_at = now() where coach_id = c and athlete_id = a;
    return 'accepted';
  end if;
  return cur.status;
end
$$;
revoke all on function public.request_link(uuid) from public, anon;
grant execute on function public.request_link(uuid) to authenticated;

-- Répondre à une demande reçue (accepter / refuser).
create or replace function public.answer_link(p_other uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_accept then
    update public.coach_links set status = 'accepted', accepted_at = now()
     where status = 'pending' and requested_by = p_other
       and ((coach_id = me and athlete_id = p_other) or (athlete_id = me and coach_id = p_other));
  else
    delete from public.coach_links
     where status = 'pending' and requested_by = p_other
       and ((coach_id = me and athlete_id = p_other) or (athlete_id = me and coach_id = p_other));
  end if;
end
$$;
revoke all on function public.answer_link(uuid, boolean) from public, anon;
grant execute on function public.answer_link(uuid, boolean) to authenticated;

-- Retirer un lien ou annuler une demande (l'un ou l'autre peut le faire).
create or replace function public.remove_link(p_other uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.coach_links
   where (coach_id = auth.uid() and athlete_id = p_other) or (athlete_id = auth.uid() and coach_id = p_other)
$$;
revoke all on function public.remove_link(uuid) from public, anon;
grant execute on function public.remove_link(uuid) to authenticated;

-- Mes liens : acceptés, demandes reçues, demandes envoyées.
create or replace function public.my_links()
returns table (user_id uuid, name text, club text, licence text, status text, incoming boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, i.name, i.club,
         case when c.coach_id = auth.uid() then i.licence end,
         c.status, c.requested_by <> auth.uid(), c.created_at
  from public.coach_links c
  join auth.users o on o.id = case when c.coach_id = auth.uid() then c.athlete_id else c.coach_id end
  cross join lateral public.account_info(o.id) i
  where c.coach_id = auth.uid() or c.athlete_id = auth.uid()
  order by c.status desc, i.name
$$;
revoke all on function public.my_links() from public, anon;
grant execute on function public.my_links() to authenticated;

-- Suggestions pour un coach : comptes athlètes dont la licence (ou le nom) est dans son groupe, pas encore reliés.
create or replace function public.link_suggestions()
returns table (user_id uuid, name text, club text, licence text)
language sql stable security definer set search_path = '' as $$
  select distinct u.id, i.name, i.club, i.licence
  from public.athletes a
  join public.profiles p on p.role = 'athlete'
    and ((a.licence is not null and p.licence = a.licence) or public.norm(p.name) = public.norm(a.name))
  join auth.users u on u.id = p.user_id
  cross join lateral public.account_info(u.id) i
  where a.coach_id = auth.uid() and not a.archived
    and not exists (select 1 from public.coach_links c where c.coach_id = auth.uid() and c.athlete_id = u.id)
  limit 20
$$;
revoke all on function public.link_suggestions() from public, anon;
grant execute on function public.link_suggestions() to authenticated;
