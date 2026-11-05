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
