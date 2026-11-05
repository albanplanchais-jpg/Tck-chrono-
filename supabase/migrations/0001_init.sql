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
