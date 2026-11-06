-- TCK Chrono — « Retrouve-toi » plus tolérant + licences trouvées via l'API du classement.
-- À exécuter après 0009_links.sql. Ré-exécutable sans risque.

-- Lettres seules, sans accents ni casse : « Le Guennec », « LE-GUENNEC », « leguennec » → « leguennec ».
create or replace function public.compact(t text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(public.norm(t), '[^a-z]', '', 'g')
$$;

-- Nom de famille COMPLET + au moins 2 lettres du prénom, dans n'importe quel ordre et découpage
-- (« Loig Le » + « Guennec » trouve Loig LE GUENNEC). 5 résultats au plus.
create or replace function public.find_licensee(p_nom text, p_prenom text)
returns table (licence text, nom text, prenom text, club text, categorie text, embarcation text)
language plpgsql stable security definer set search_path = '' as $$
declare q text := public.compact(coalesce(p_prenom, '') || ' ' || coalesce(p_nom, ''));
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if char_length(btrim(coalesce(p_nom, ''))) < 2 or char_length(btrim(coalesce(p_prenom, ''))) < 2 then
    raise exception 'Indique ton nom de famille complet et au moins 2 lettres du prénom';
  end if;
  return query
    select l.licence, l.nom, l.prenom, l.club, l.categorie, l.embarcation
    from public.licensees l
    where l.active
      and char_length(public.compact(l.nom)) >= 2
      and position(public.compact(l.nom) in q) > 0
      and char_length(replace(q, public.compact(l.nom), '')) >= 2
      and public.compact(l.prenom) like replace(q, public.compact(l.nom), '') || '%'
    order by l.prenom, l.club
    limit 5;
end
$$;
revoke all on function public.find_licensee(text, text) from public, anon;
grant execute on function public.find_licensee(text, text) to authenticated;

-- Relier sa licence : nom comparé sans espaces ni tirets ; une licence ne va qu'à un seul compte.
create or replace function public.claim_licence(p_licence text, p_nom text)
returns table (licence text, nom text, prenom text, club text, categorie text, embarcation text)
language plpgsql security definer set search_path = '' as $$
declare l public.licensees;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into l from public.licensees x
   where x.licence = btrim(p_licence) and public.compact(x.nom) = public.compact(p_nom);
  if l.licence is null then raise exception 'Licence introuvable : vérifie le numéro et le nom de famille'; end if;
  if exists (select 1 from public.profiles p where p.licence = l.licence and p.user_id <> auth.uid()) then
    raise exception 'Cette licence est déjà reliée à un autre compte. Écris à ton club si ce n''est pas toi.';
  end if;
  insert into public.profiles (user_id, role, name, club, licence)
  values (auth.uid(), 'athlete', l.prenom || ' ' || l.nom, l.club, l.licence)
  on conflict (user_id) do update set licence = excluded.licence, name = excluded.name, club = excluded.club, updated_at = now();
  return query select l.licence, l.nom, l.prenom, l.club, l.categorie, l.embarcation;
end
$$;
revoke all on function public.claim_licence(text, text) from public, anon;
grant execute on function public.claim_licence(text, text) to authenticated;

-- Licence trouvée via l'API du classement (pas encore dans la base) : reliée au profil seulement.
-- Si la licence est déjà dans la base, on applique la vérification normale (claim_licence).
create or replace function public.claim_licence_listed(p_licence text, p_nom text, p_prenom text, p_club text)
returns table (licence text, nom text, prenom text, club text, categorie text, embarcation text)
language plpgsql security definer set search_path = '' as $$
declare lic text := btrim(coalesce(p_licence, ''));
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.licensees x where x.licence = lic) then
    return query select * from public.claim_licence(lic, p_nom);
    return;
  end if;
  if lic !~ '^[A-Za-z0-9-]{3,20}$' or char_length(btrim(coalesce(p_nom, ''))) < 2 or char_length(btrim(coalesce(p_prenom, ''))) < 1 then
    raise exception 'Licence invalide';
  end if;
  if exists (select 1 from public.ffck_oppositions o where o.licence = lic) then raise exception 'Licence introuvable'; end if;
  if exists (select 1 from public.profiles p where p.licence = lic and p.user_id <> auth.uid()) then
    raise exception 'Cette licence est déjà reliée à un autre compte. Écris à ton club si ce n''est pas toi.';
  end if;
  insert into public.profiles (user_id, role, name, club, licence)
  values (auth.uid(), 'athlete', left(btrim(p_prenom) || ' ' || upper(btrim(p_nom)), 60), left(nullif(btrim(coalesce(p_club, '')), ''), 80), lic)
  on conflict (user_id) do update set licence = excluded.licence, name = excluded.name, club = excluded.club, updated_at = now();
  return query select lic, upper(btrim(p_nom)), btrim(p_prenom), nullif(btrim(coalesce(p_club, '')), ''), null::text, null::text;
end
$$;
revoke all on function public.claim_licence_listed(text, text, text, text) from public, anon;
grant execute on function public.claim_licence_listed(text, text, text, text) to authenticated;

-- Pour la fonction Vercel : parmi ces licences, lesquelles sont sur la liste d'opposition.
create or replace function public.filter_opposed(p_licences text[])
returns setof text language sql stable security definer set search_path = '' as $$
  select o.licence from public.ffck_oppositions o where o.licence = any (p_licences)
$$;
revoke all on function public.filter_opposed(text[]) from public, anon;
grant execute on function public.filter_opposed(text[]) to authenticated;
