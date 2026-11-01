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
