# TCK Chrono

PWA de chronométrage pour coach (iPhone & Android). Noir et blanc, utilisable d'une main, fonctionne **sans réseau**.

## Principe
1. **Préparer la séance** : saisir les athlètes (les récents sont mémorisés).
2. **TAP** : le gros bouton capture l'instant exact du contact du doigt.
3. **Attribuer** : choisir qui. Départ / arrivée est déduit automatiquement (arrivée si l'athlète est en course), ou forcé via le sélecteur. Départ groupé possible.
4. **Terminer** → classement par meilleur temps, détail des passages, partage (texte + CSV).

Seuls les *taps* sont enregistrés ; tous les temps sont recalculés (`src/core/results.ts`) → réattribuer ou annuler un tap est sans risque. Sauvegarde locale (IndexedDB) après chaque tap : l'app reprend où elle en était après une fermeture.

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
