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
-- DERNIÈRE ÉTAPE : te valider comme coach (accès à la liste FFCK).
-- Remplace l'adresse ci-dessous par celle de TON compte coach, puis enlève les deux tirets « -- » au début des 2 lignes.
-- ────────────────────────────────────────────────────────────
-- insert into public.coach_approvals (user_id, note)
-- select id, 'coach Torcy' from auth.users where email = 'TON-EMAIL-ICI' on conflict (user_id) do nothing;
