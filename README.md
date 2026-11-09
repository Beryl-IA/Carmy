# Carmy

Appli personnelle (PWA pour iPhone) qui transforme une vidéo de recette en fiche structurée, puis en liste de courses. Cahier des charges : [`docs/cahier-des-charges-carmy.md`](docs/cahier-des-charges-carmy.md).

**État : jalons J0 (PWA installable + déploiement) et J1 (prototype d'extraction Gemini).**

## Lancer en local

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests unitaires (Vitest)
npm run build      # build de production dans dist/
```

Le nom de l'appli est centralisé dans `src/config.ts`. Les icônes se régénèrent depuis `public/icons/icon.svg` avec `npm run icons` (nécessite Playwright).

## Déploiement GitHub Pages

1. Dépôt GitHub → **Settings → Pages → Source : GitHub Actions**.
2. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, publication).
3. L'appli est servie à `https://<compte>.github.io/<nom-du-depot>/` (le sous-chemin est calculé automatiquement).

## Installation sur iPhone

Safari → ouvrir l'adresse de l'appli → bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

## Clé API Gemini

1. Aller sur Google AI Studio (aistudio.google.com) → **Get API key** → créer une clé.
2. Dans l'appli : **Réglages de l'IA** → coller la clé → **Tester la clé** → choisir un modèle « Flash ».
3. La clé est stockée uniquement sur l'appareil. Ne jamais la committer.
