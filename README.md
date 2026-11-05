# TCK Chrono

PWA de chronométrage pour coach (iPhone & Android). Noir et blanc, utilisable d'une main, fonctionne **sans réseau**.

## Principe
1. **Préparer la séance** : nom + dossard de chaque athlète (les récents sont mémorisés), ordre de départ du premier au dernier (▲▼ ou « Trier par n° »), et vagues (« Part avec… » : ils partent ensemble, un seul DÉP pour toute la vague). L'ordre se modifie aussi pendant la séance (« Ordre ✎ »).
2. **Séance** : une ligne par athlète avec ses boutons DÉP / INT / ARR. Une impulsion sur le logo (fixe, en bas) capture l'instant exact ; on touche ensuite le bouton de la ligne. Plusieurs impulsions s'attribuent dans l'ordre. Sans impulsion en attente, toucher un bouton enregistre l'instant du toucher. « Tous partent » pour un départ groupé.
4. **Terminer** → classement par meilleur temps, détail des passages, export **Excel (.xlsx)** et envoi **WhatsApp**.

Seuls les *taps* sont enregistrés ; tous les temps sont recalculés (`src/core/results.ts`) → réattribuer ou annuler un tap est sans risque. Sauvegarde locale (IndexedDB) après chaque tap : l'app reprend où elle en était après une fermeture.

## Comptes coach et lien athlètes (Supabase)
- **Coach** : compte e-mail + mot de passe obligatoire pour créer une séance. La séance est synchronisée vers Supabase après chaque modification (l'app reste utilisable hors ligne et renvoie tout dès que le réseau revient).
- **Athlètes** : bouton **Lien** pendant la séance → QR code / lien `…/s/CODE`. Sans compte, l'athlète choisit son nom ou s'inscrit (il apparaît alors sur une nouvelle ligne chez le coach) et suit son chrono + le classement en direct.
- Sans variables Supabase, l'app fonctionne en mode local (pas de compte, pas de lien).

- **Chronométreurs** : *Partager → Chronométreurs* → choisir les droits (DÉPART, INTER, ARRIVÉE) → lien `…/t/…`. La personne entre son nom et ne voit que ses boutons. Chaque téléphone se cale sur l'horloge du serveur (précision affichée, ±20 ms environ) : départ pris sur un téléphone, arrivée sur un autre. Ses taps sont mis en file et renvoyés s'il perd le réseau ; le coach les voit (« par Paul ») et peut les corriger.

- **Espace coach** (onglets *Séance · Historique · Profil*) : toutes les séances enregistrées (titre, date, athlètes, passages, meilleur temps), consultables à tout moment ; profil avec statistiques, **« Mon groupe »** (athlètes enregistrés en base, meilleur temps, nombre de séances, fiche par athlète), réglages du chrono (précision 1/10 ou 1/100, vibration, écran allumé, bip) et export Excel de toutes les séances.

### Mise en place
1. Supabase → **SQL Editor** → coller et exécuter `supabase/migrations/0001_init.sql`, puis `0002_timekeepers.sql`, puis `0003_bibs.sql`, puis `0004_history_athletes.sql` (dans l'ordre).
2. Supabase → **Authentication → URL Configuration** : *Site URL* = l'URL Vercel (ex. `https://tck-chrono.vercel.app`), et l'ajouter aux *Redirect URLs*.
3. Vercel → **Settings → Environment Variables** : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé *anon/publishable*, jamais la *service_role*), puis redéployer.

Le serveur MCP Supabase est déclaré dans `.mcp.json` (à authentifier avec `claude /mcp`).

## Développement
```bash
npm install
npm run dev      # http://localhost:5173 (accessible sur le réseau local pour tester au téléphone)
npm test         # tests de la logique de calcul
npm run build    # build de prod dans dist/
npm run icons    # régénère les icônes (Playwright)
```

## Déploiement (Vercel)
Importer le dépôt GitHub dans Vercel → réglages par défaut (Vite détecté). Chaque push sur `main` déploie.
`vercel.json` empêche la mise en cache du service worker pour que les mises à jour arrivent.

## Installation sur le téléphone
- **iPhone** : ouvrir le lien dans **Safari** → Partager → *Sur l'écran d'accueil*.
- **Android** : Chrome propose *Installer l'application*.

## Structure
```
src/core/       logique pure (modèle, calcul des temps, formats) — testée
src/store/      état de séance + persistance IndexedDB
src/screens/    Setup · Timer · Results
src/components/ AssignSheet · ConfirmModal · Icon
src/device/     wake lock, bip/vibration, partage
```

## Feuille de route
- V1.1 (fait) : chrono inter (0–3 par passage), départ/arrivée groupés, journal pour réattribuer, affichage dense 15+ athlètes
- V1.5 : compte coach (code par e‑mail) + synchro Supabase + historique
- V2 : deux téléphones synchronisés (départ / arrivée)
