-- TCK Chrono — type de séance (classique / mass start / poursuite) et plan de poursuite.
-- À exécuter après 0007_ffck_sharing.sql. Ré-exécutable sans risque.
alter table public.sessions add column if not exists mode text check (mode in ('classic', 'mass', 'pursuit'));
alter table public.sessions add column if not exists pursuit jsonb;
