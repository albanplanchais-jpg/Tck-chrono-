# Chrono — landing page

Site vitrine de **Chrono**, le chronomètre des coachs de canoë-kayak (Torcy Canoë-Kayak).
Construit à partir du template [Simple de Cruip](https://github.com/cruip/tailwind-landing-page-template) (Next.js 15, Tailwind CSS 4, animations AOS).

## Lancer en local

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## Mettre en ligne

```bash
pnpm build        # génère le dossier out/ (site 100 % statique)
```

Le dossier `out/` se dépose tel quel sur Netlify (glisser-déposer), Vercel, GitHub Pages ou n'importe quel hébergeur statique.
Le dossier `out/` fourni dans l'archive est déjà construit.

## Où modifier quoi

| Fichier | Contenu |
| --- | --- |
| `components/config.ts` | **URL de l'app** (boutons « Ouvrir l'app » / « Installer ») |
| `components/hero-home.tsx` | Titre, accroche, boutons du haut |
| `components/live-chrono.tsx` | Chrono en direct + bouton TAP essayable |
| `components/race.tsx` | Course animée (noms et temps dans `LANES`) |
| `components/features-tap.tsx` | Section « TAP, puis qui ? » et les 3 arguments |
| `components/cta.tsx` | Bloc final d'installation |
| `components/ui/footer.tsx` | Liens du pied de page (à remplir) |
| `app/css/style.css` | Couleurs (`--color-*`), polices, animations |
| `public/images/club-logo.png` | Logo du club (blanc, fond transparent) |

## Charte

Noir `#000`, blanc `#FFF` et trois gris seulement (`#1A1A1A`, `#333`, `#888`).
Polices auto-hébergées : Outfit (titres) et JetBrains Mono (chiffres, `tabular-nums`).
Les animations se coupent si l'utilisateur a activé « réduire les animations ».

## Licence

Template d'origine © Cruip, sous licence GPL-3.0 : utilisation personnelle et commerciale autorisée,
mais pas de republier ni revendre le template lui-même.
