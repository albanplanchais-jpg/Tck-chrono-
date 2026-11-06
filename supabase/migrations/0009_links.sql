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
