# Passation — Carmy v1.0.0 (pour une nouvelle session Claude Code)

> À lire en entier avant de toucher au code. Rédigé le 10/11/2026 à la fin de la V1.
> Dépôt : `Beryl-IA/Carmy` (GitHub). Branche de production : `main` (chaque push déploie).
> Cahier des charges d'origine : `docs/cahier-des-charges-carmy.md`. Doc utilisateur : `README.md`.

## 1. Le projet en bref

**Carmy** est une appli **personnelle** (une seule utilisatrice), en **PWA installée sur l'écran d'accueil d'un iPhone 13** (Safari/iOS récent). Elle :

1. transforme une **vidéo de recette** (Instagram/TikTok déjà enregistrée dans Photos), un **texte collé** ou une **saisie manuelle** en fiche structurée, via l'**API Gemini** appelée directement depuis le navigateur avec la clé de l'utilisatrice ;
2. impose une **relecture** avant enregistrement ;
3. range les recettes dans une **bibliothèque** (recherche, tags, collections, portions) ;
4. propose un **mode cuisine** (étape par étape, minuteurs, écran allumé) ;
5. génère une **liste de courses** fusionnée par rayon, avec garde-manger ;
6. gère une **file d'attente** des extractions échouées et la **sauvegarde/restauration** JSON.

**Contraintes non négociables** (cahier des charges §2) : gratuit, **aucun backend** (tout en IndexedDB, seul appel réseau = Gemini), hébergement **GitHub Pages** sous sous-chemin, pas de Mac/Xcode/appli native, **clé API jamais dans le code ni le dépôt ni les sauvegardes**, langue de l'interface : **français**. Ne jamais copier code/visuels/nom/logo d'applis existantes (GoomY, Jow servent seulement d'inspiration fonctionnelle).

## 2. État : tous les jalons J0 → J7 sont livrés et validés sur iPhone

| Jalon | Contenu | Version |
|---|---|---|
| J0 | Vite + Preact + TS, PWA installable, déploiement GitHub Pages via Actions | 0.1.0 |
| J1 | Prototype d'extraction Gemini (go/no-go R1, R2, R5) | 0.1.x |
| J2 | Modèle de données, IndexedDB, onglets, ajout vidéo/texte/manuel, écran de relecture | 0.2.0 |
| J3 | Bibliothèque : recherche, tags, collections, fiche avec portions, modifier/supprimer | 0.3.0 |
| J4 | Mode cuisine, minuteurs multiples, alarme, Wake Lock | 0.4.x |
| J5 | Liste de courses (§9) : fusion, conversions, rayons, garde-manger, cases, ajout manuel | 0.5.0 |
| J6 | File d'attente F7, export/import F8, rappel de sauvegarde, réglages F9 | 0.6.0 |
| J7 | Contrastes AA, accessibilité (audit axe-core sans erreur sur 15 écrans), page d'aide, README | **1.0.0** |

Les 77 tests Vitest passent. L'utilisatrice a validé chaque jalon sur son iPhone (« tout fonctionne »).

## 3. Stack et commandes

- **Vite 8 + TypeScript (strict, `noUncheckedIndexedAccess`) + Preact 10**, **vite-plugin-pwa** (generateSW, `registerType: 'prompt'`), **idb 8**, **Vitest 5** (+ `fake-indexeddb` pour les tests de stockage).
- Dépendances d'exécution : seulement `preact` et `idb` (~41 Ko gzip). **Ne pas ajouter de dépendance lourde** (consigne §16).
- Pas de framework CSS : `src/styles.css`, variables CSS, sections commentées par jalon.

```bash
npm install
npm run dev          # http://localhost:5173/
npm test             # Vitest
npm run build        # tsc --noEmit + vite build → dist/
BASE_PATH=/Carmy/ npm run build && npm run preview   # simule GitHub Pages
npm run icons        # régénère les PNG depuis public/icons/icon.svg (Playwright)
```

**Déploiement** : `.github/workflows/deploy.yml` → sur push `main` : `npm ci`, `npm test`, `npm run build` avec `BASE_PATH=/${{ github.event.repository.name }}/`, publication Pages. URL : `https://beryl-ia.github.io/Carmy/` (C majuscule). Le service worker affiche « Nouvelle version disponible » → l'utilisatrice touche « Mettre à jour ». **Pensez à incrémenter `version` dans `package.json`** (affichée en bas des Réglages : c'est ainsi que l'utilisatrice vérifie qu'elle a la bonne version).

## 4. Architecture des fichiers

```
src/
  config.ts              APP_NAME = 'Carmy' (nom centralisé, utilisé partout : titre, manifest, export…)
  main.tsx, app.tsx      coquille : charge les réglages, TimersProvider, routes, TabBar, AddPage toujours montée (hidden)
  router.ts              navigation par ancre (#/…) — compatible hors-ligne et sous-chemin
  styles.css             thème (tokens :root), styles par jalon
  model/                 LOGIQUE PURE, TESTÉE (aucun accès DOM/DB)
    types.ts             types §7 + ajouts (QueueJob, ShoppingState, Settings…), AISLES, UNITS, constantes
    draft.ts             brouillon de relecture : parseQuantity (« 1,5 », « 1/2 », « ½ »), draftToRecipe (validation FR)
    scale.ts             mise à l'échelle des portions + arrondi intelligent selon l'unité (§9.1)
    search.ts            normalizeText (sans accents, œ→oe), filterRecipes, tagsByFrequency
    shopping.ts          buildShoppingList (§9 complet), unitFamily, displayQuantity
    timers.ts            minuteurs fondés sur l'heure de fin (endsAt), pause/reprise/ajout, tickTimers
    backup.ts            format de sauvegarde, parseBackup, mergeData (remplacer/fusionner), backupReminder
  extraction/
    types.ts             ExtractionProvider (abstraction obligatoire F2), ExtractionError (kinds), ExtractedRecipe
    prompt.ts            instructions système + RESPONSE_SCHEMA (§8)
    validate.ts          parseExtractedRecipe : validation/normalisation de la réponse IA
    gemini.ts            GeminiProvider : inline base64 < 14 Mo sinon Files API résumable ; streaming SSE ;
                         timeouts ; thinkingLevel 'low' et mediaResolution LOW (retirés si 400) ;
                         bascule sur le modèle suggéré par un 404 ; listGeminiModels ; sortModels
  db/db.ts               IndexedDB (voir §5)
  media/                 thumbnail.ts (miniature vidéo), alarm.ts + chimeWav.ts (alarme), wakelock.ts
  timers/TimersContext.tsx  état global des minuteurs, alarme plein écran, TimerDock (pastilles hors cuisine)
  pwa/                   UpdateBanner (useRegisterSW), standalone.ts
  components/            RecipeEditor (relecture/édition), RecipeView, SettingsCard (clé/modèle/tests),
                         TabBar (pastille de file), BackupCard (+ useExport), PantryEditor
  pages/                 RecipesPage, RecipePage (fiche), EditPage, CollectionsPage, AddPage, CookPage,
                         ShoppingPage, SettingsPage, HelpPage
tests/                   *.test.ts (Vitest) — logique pure + IndexedDB simulée
```

### Routes (`src/router.ts`)
`#/recettes` · `#/recette/<id>` · `#/modifier/<id>` · `#/collections` · `#/cuisine/<id>/<étape>/<portions>` · `#/ajouter` · `#/courses` · `#/reglages` · `#/aide`. `tabOf()` mappe chaque route sur un onglet. `replaceRoute()` met à jour l'ancre sans navigation (utilisé par le mode cuisine pour mémoriser l'étape).

## 5. Données et stockage

**IndexedDB** `carmy`, **version 1** (toute nouvelle structure ⇒ incrémenter `DB_VERSION` et écrire la migration dans `upgrade`) :

| Store | Clé | Contenu |
|---|---|---|
| `recipes` | `id` (index `updatedAt`) | `Recipe` ; miniature en **Blob** |
| `collections` | `id` | `Collection { id, name }` |
| `kv` | clé libre | `'settings'` (Settings), `'shopping'` (ShoppingState), `'pantry'` (PantryItem[]) |
| `queue` | `id` | `QueueJob` (vidéo en Blob, 5 max) |

**localStorage** (petits confort par appareil, toujours dans try/catch) : `carmy.timers` (minuteurs en cours), `carmy.installHint` (bandeau masqué). `carmy.settings.v0` = réglages du prototype J1, **migrés puis supprimés** au premier chargement.

Points clés du modèle :
- `Settings` : `apiKey?`, `model`, `defaultServings` (1), `fastMode`, `forceFilesApi`, `lastBackupAt?`, `recipesSinceBackup`, `firstLaunchAt?`, `backupSnoozeUntil?`. `saveSettings` relit `recipesSinceBackup` en base pour ne pas écraser l'incrément fait par `saveRecipe`.
- `saveRecipe` incrémente `recipesSinceBackup` **uniquement à la création**.
- Liste de courses **recalculée** (selections + manualItems + garde-manger) ; on ne stocke que les choix. Clé de ligne = `nomNormalisé|familleUnité` (familles : `masse`, `volume`, `sans_quantite`, ou l'unité comptable). Articles manuels : clé `manuel:<id>`, jamais fusionnés.
- Sauvegarde JSON : `{ app:'carmy', format:1, exportedAt, appVersion, recipes (miniatures en data URL), collections, tags, pantry, settings (SANS apiKey), shopping }`. La file d'attente n'est pas sauvegardée.

## 6. Décisions et écarts au cahier des charges (déjà validés)

- **Modèle IA** : réglage, jamais figé. Modèle validé : **`gemini-3.5-flash-lite`**. `gemini-2.5-flash` est refusé aux nouveaux comptes ; `gemini-3.8-flash` ne répondait pas en 4 min sur une vidéo d'1 min. Boutons « Tester la clé » (liste les modèles) et « Tester le modèle » (mini-recette texte, mesure la latence).
- **R1 levé** : la Files API résumable fonctionne depuis Safari iOS (en-tête `x-goog-upload-url` lisible).
- L'abonnement Gemini grand public de l'utilisatrice **ne s'applique pas** à l'API (offre gratuite de l'API, quota journalier).
- Palette ajustée pour le contraste AA : basilic `#466F49`, fond des boutons `--terracotta-btn: #C4461E` ; `#D9532B` reste pour le décoratif.
- Réglages ajoutés : « Analyse rapide » (mediaResolution LOW, activée par défaut) et « Toujours passer par la Files API ».
- Courses : état coché par ingrédient + famille d'unité ; `removedKeys` (lignes supprimées, réinitialisées quand une nouvelle recette est ajoutée) et `pantryOverrides`.
- File d'attente : garde aussi `fileName` et `thumbnail`. Sauvegarde : inclut la liste de courses.
- Minuteurs : continuent hors du mode cuisine, survivent à un rechargement.
- Garde-manger : correspondance **exacte** du nom normalisé (« huile » ≠ « huile d'olive »).

## 7. Pièges iOS / PWA déjà résolus (ne pas les réintroduire)

- **Son avec le bouton silencieux** : Web Audio est coupé par le bouton silencieux. L'alarme est un **WAV généré** (`chimeWav.ts`) lu par un élément `<audio>`, « déverrouillé » par une lecture muette pendant le tap qui lance le minuteur (`unlockAudio()`). Web Audio reste en secours. Ne pas revenir à Web Audio seul.
- **Arrière-plan** : iOS suspend la page quand on change d'appli → requêtes figées. D'où : timeouts par étape (`TIMEOUTS_MS`), chrono visible, avertissement « reste sur l'appli ». Pas de notification locale possible sans serveur.
- **Minuteurs** : toujours calculer depuis `endsAt` (heure de fin), jamais un compteur décrémenté.
- **Wake Lock** : redemander au retour au premier plan (`visibilitychange`) ; statut `error` → message d'aide (verrouillage auto).
- **navigator.share** exige un geste récent : si la préparation du fichier est longue → `NotAllowedError` → second bouton « Partager la sauvegarde » (voir `useExport`).
- **Stockage séparé** entre Safari et l'appli installée : toujours ouvrir depuis l'icône.
- `crypto.randomUUID` a un repli ; la mémoire : vidéos traitées en Blob (FileReader.readAsDataURL pour le base64), file limitée à 5.
- Sous-chemin GitHub Pages : utiliser `import.meta.env.BASE_URL` pour les ressources, routes par ancre.

## 8. Conventions de travail (attendues par l'utilisatrice)

- **Tout en français** : interface, messages, commits, réponses. Tutoiement dans l'appli.
- Travailler **par jalon / par fonctionnalité**, un commit par fonctionnalité, messages clairs en français, se terminant par les lignes d'attribution demandées par l'environnement.
- **Logique métier pure et testée** dans `src/model/`, séparée de l'interface ; ajouter des tests Vitest pour toute nouvelle règle.
- **Signaler toute décision qui s'écarte du cahier des charges** avant/au moment de l'appliquer, et la noter dans la section « Écarts » du README.
- **À chaque livraison**, donner à l'utilisatrice des **étapes de test précises sur iPhone** (elle teste sur appareil réel et répond « tout fonctionne » ou décrit le problème avec une capture). Elle n'a ni Mac ni Xcode.
- Incrémenter la version, mettre à jour le README (« État », fonctionnalités, écarts).
- Accessibilité : contraste AA, zones tactiles ≥ 44 px, `safe-area-inset`, labels ARIA, `prefers-reduced-motion`. Pas de thème sombre (hors périmètre V1).
- Stockage navigateur : toujours dans try/catch.

### Vérification avant livraison (méthode utilisée en V1)
1. `npx tsc --noEmit`, `npm test`, `BASE_PATH=/Carmy/ npm run build`.
2. Servir `dist/` sous `/Carmy/` (ex. `python3 -m http.server` sur un dossier contenant `Carmy/`) et jouer le parcours avec **Playwright** en émulation `devices['iPhone 13']`, en simulant l'API Gemini avec `context.route('https://generativelanguage.googleapis.com/**', …)` (réponses SSE `data: {...}\n\n`, erreurs 429/404/400). Ces scripts n'ont pas été commités.
3. Audit d'accessibilité avec axe-core (injecté dans la page) sur les écrans touchés.
4. Limites de l'émulation : pas de feuille de partage, pas de vrai Wake Lock, pas de vrai Gemini → le dire à l'utilisatrice et lui faire tester ces points.

## 9. Git / GitHub

- Historique linéaire sur `main` (la branche de travail `j0-j1` est identique à `main` et peut être supprimée). Aucune pull request n'a été ouverte : l'utilisatrice a demandé de pousser directement sur `main` pour déclencher le déploiement.
- Dans un environnement Claude Code distant, l'écriture sur le dépôt nécessite que `Beryl-IA/Carmy` soit **attaché à la session** (droits de push).

## 10. V2 — batch cooking (en cours, demandée le 10/11/2026)

Feuille de route validée par l'utilisatrice (détail dans le README) :
- **V2-J1 (1.1.0, livré)** : recette depuis 1 à 10 captures d'écran (`media/image.ts`, entrée `images` du provider, source `image`, file d'attente `kind: 'images'`).
- **V2-J2** : fiche enrichie inspirée (fonctionnellement seulement) de l'appli Basta : icône par ingrédient, conservation conseillée frigo/congélateur, valeurs nutritionnelles ; session de batch cooking avec déroulé optimisé.
- **V2-J3** : réserve (plats cuisinés + produits achetés) avec **quantités** ; cuisiner une recette décompte automatiquement les ingrédients du stock (ex. 300 g de riz).
- **V2-J4** : planning de la semaine, **midi et soir uniquement, 1 personne**.

## 11. Pistes V2 d'origine (cahier des charges §13) — l'utilisatrice va préciser ses propres fonctionnalités

- Calories / valeurs nutritionnelles par portion.
- « Que cuisiner avec ce que j'ai » (recherche par ingrédients disponibles — `search.ts`/`normalizeText` réutilisables).
- Favoris, planning de repas, partage de la liste de courses vers Rappels / copie en texte.

Hors périmètre V1 explicite (ne pas ajouter sans demande) : semainier, favoris, notes perso, photo/capture en entrée, import par lien de site, coche des ingrédients en mode cuisine, thème sombre, comptes et synchro en ligne.
