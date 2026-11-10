# Carmy

Appli personnelle (PWA pour iPhone) qui transforme une vidéo de recette en fiche structurée, puis en liste de courses. Cahier des charges : [`docs/cahier-des-charges-carmy.md`](docs/cahier-des-charges-carmy.md).

**État : jalons J0 à J6 livrés** (PWA installable, extraction Gemini, relecture et enregistrement local, bibliothèque avec recherche, tags, collections et portions, mode cuisine avec minuteurs, liste de courses fusionnée par rayon avec garde-manger, file d'attente des extractions, sauvegarde et restauration).

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

L'abonnement grand public Gemini (Google AI Pro/Ultra) ne s'applique pas à l'API : la clé AI Studio reste sur l'offre gratuite de l'API tant que la facturation n'est pas activée sur son projet.

## Sauvegarde

Réglages › Sauvegarde › **Exporter** : un fichier `carmy-sauvegarde-AAAA-MM-JJ.json` (recettes avec miniatures, collections, garde-manger, réglages, liste de courses — jamais la clé API) à ranger dans Fichiers ou iCloud Drive. **Importer** propose « Fusionner » ou « Remplacer » après un aperçu. Un rappel s'affiche après 14 jours sans sauvegarde ou plus de 10 nouvelles recettes.

## Bilan du jalon 1 (09/11/2026)

- **Go** : extraction validée sur iPhone 13 avec le modèle **`gemini-3.5-flash-lite`**.
- **R1 (Files API depuis Safari iOS)** : OK — envoi résumable, attente `ACTIVE` et analyse fonctionnent.
- **Écueils rencontrés** : `gemini-2.5-flash` est refusé aux nouveaux comptes (bascule automatique sur le modèle suggéré par Google) ; avec `gemini-3.8-flash`, aucune réponse en 4 min sur une vidéo d'1 min.
- Le modèle reste un réglage (bouton « Tester le modèle » pour mesurer la latence).
