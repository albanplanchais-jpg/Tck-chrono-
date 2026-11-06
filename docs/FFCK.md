# Licenciés FFCK dans TCK Chrono

## Ce que fait l'app
Sur l'écran **Séance**, le coach tape quelques lettres (nom, prénom ou club) : l'app propose les licenciés FFCK,
**« Mon club » (Torcy) d'abord**, sans tenir compte des accents ni de la casse, en tolérant une petite faute de frappe.
L'ajout à la main reste toujours possible. La liste est gardée sur le téléphone (IndexedDB) : tout marche hors ligne.

## Source des données et fréquence
- **Source** : FFCK, dans le cadre de l'accord passé avec la Fédération (adaptateur `csv` ou `api`, à brancher quand le format exact est connu).
- **Fréquence** : une fois par jour à **4 h (heure de Paris)**, par GitHub Actions (`.github/workflows/ffck-sync.yml`).
- **Champs conservés, et uniquement eux** : n° de licence, nom, prénom, club, catégorie d'âge, embarcation/discipline.
  Toute autre colonne de la source (adresse, téléphone, e-mail, date de naissance…) est ignorée dès la lecture.
- **Respect du serveur FFCK** : User-Agent « TCK Chrono » avec contact (`FFCK_CONTACT`), 1,5 s entre deux requêtes, nouvel essai avec attente croissante sur 429/5xx.
- **Sécurité de publication** : si la structure de la source change, si elle est vide, si trop de lignes sont illisibles ou si le nombre d'actifs chute de plus de 30 %, la tâche s'arrête **sans rien publier** (la PWA garde l'ancienne liste) et une alerte part (e-mail GitHub, et Discord si `DISCORD_WEBHOOK_URL` est défini).
- **Diff quotidien** : ajouts, modifications, licenciés disparus **marqués inactifs** (pas supprimés, pour ne pas casser l'historique des séances), réactivations. Les inactifs restent 400 jours dans le fichier, puis en sortent.

## Source « classement descente » (en attendant l'export FFCK)
Adaptateur `scripts/ffck-sync/sources/classement.mjs` pour le site indépendant *classements-descente.plargentanck.fr*
(API vérifiée le 06/11/2026 : `GET /ranking/list` puis `GET /ranking/{code_liste}?limit=500&offset=…`).
- **À n'activer qu'avec l'accord de l'auteur du site** (ce n'est pas la FFCK, l'accord fédéral ne le couvre pas).
- Lit **uniquement la dernière édition** du classement national descente (≈ 1 100 athlètes classés, 3 requêtes par nuit).
- Le **n° de licence** est tiré de `code_bateau` (`C1D423135` → `423135`) ; un biplace (`C2…`) donne deux licenciés.
  Le lien « compte athlète ↔ licence » fonctionne donc avec cette source.
- Seuls les athlètes **classés** (au moins une course nationale) y figurent : les débutants sont à ajouter à la main.
- Champs gardés : licence, nom, prénom, club, catégorie (`C1DU15`…), embarcation. Points, rang, nb de courses ignorés.
- Réglages : `FFCK_SOURCE=classement` suffit. Facultatif : `CLASSEMENT_API` (adresse de base), `CLASSEMENT_LIST_URL`,
  `CLASSEMENT_RANKING_URL` (avec `{id}`).
- Même politesse et mêmes garde-fous que les autres sources (1,5 s entre requêtes, arrêt sans publier si la structure change).

## Où sont les données (RGPD — beaucoup de licenciés sont mineurs)
- Table `licensees` et fichier `licencies.json.gz` dans un **bucket Supabase privé** (`ffck`) : jamais publics, jamais indexables.
- Le fichier n'est téléchargeable **que par les coachs validés** (table `coach_approvals`). Un compte créé librement n'y a pas accès.
- Un athlète ne peut vérifier **que sa propre licence** (n° de licence + nom de famille).
- Les identifiants FFCK et la clé de service Supabase ne sont que dans les **secrets GitHub**, jamais dans le code ni dans la PWA.
- Les séances chronométrées sont visibles par les **comptes connectés** de l'app (coachs et athlètes), jamais publiquement.

## Procédure de suppression (droit d'opposition / d'effacement)
1. Supabase → SQL Editor :
   ```sql
   insert into public.ffck_oppositions (licence, note) values ('123456', 'demande du 12/11/2026');
   delete from public.licensees where licence = '123456';
   ```
2. À la synchro suivante (ou en lançant le workflow à la main), il disparaît du fichier et **n'est plus jamais réimporté**, même si la FFCK le renvoie.
3. Ses chronos déjà enregistrés : le coach retire l'athlète de son groupe (onglet Athlètes → fiche → « Retirer du groupe ») et, si demandé, supprime les séances concernées dans Supabase (`delete from public.sessions where id = '…'`).

## Premier lancement en local
```bash
npm install
node scripts/ffck-sync/sync.mjs --test          # 10 licenciés FICTIFS → scripts/ffck-sync/out/ (rien n'est publié)
node scripts/ffck-sync/sync.mjs --test --limit 30
npm test
npm run dev
```

## Mise en production
1. **Supabase → SQL Editor** : exécuter les migrations `supabase/migrations/0001` à `0007` dans l'ordre.
2. **Valider chaque coach** (accès à la liste FFCK) :
   ```sql
   insert into public.coach_approvals (user_id, note)
   select id, 'coach Torcy' from auth.users where email = 'adresse-du-coach@exemple.fr';
   ```
3. **GitHub → Settings → Secrets and variables → Actions** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FFCK_SOURCE` (`csv` ou `api`), `FFCK_CONTACT`, puis selon la source `FFCK_CSV_URL` + `FFCK_AUTH_HEADER` (+ `FFCK_ENCODING`) ou `FFCK_API_URL` + `FFCK_API_TOKEN` ; facultatif `DISCORD_WEBHOOK_URL`.
4. **GitHub → Actions → « Synchro licenciés FFCK » → Run workflow** : d'abord `test`, puis `dry-run` (vraie source, rien publié), puis `production`. Ensuite elle tourne seule chaque nuit.
