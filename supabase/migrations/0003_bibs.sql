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
