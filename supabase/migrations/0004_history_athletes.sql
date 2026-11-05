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
