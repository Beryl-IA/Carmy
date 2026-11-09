# Cahier des charges — Carmy (appli de recettes, PWA iPhone)

> Document destiné à Claude / Claude Code pour construire l'application. Langue de l'appli : français. Version 1.1 — 09/11/2026.
> Nom de l'appli : **Carmy**. Nom du dépôt et du package : `carmy`. Centraliser le nom dans une seule constante pour pouvoir le changer facilement.

---

## 1. Contexte et objectif

Application **personnelle** (un seul utilisateur) qui transforme une **vidéo de recette** (Instagram, TikTok) en **fiche recette structurée**, la range dans une **bibliothèque**, et génère une **liste de courses** à partir des recettes choisies.

Inspirations fonctionnelles : GoomY (vidéo/lien → fiche recette) et Jow (bibliothèque + liste de courses).
**Règle légale :** on reproduit des *fonctionnalités et des principes d'UX*, jamais le code, les visuels, les textes, le nom ni le logo de ces applis. Design, nom et icône sont originaux.

## 2. Contraintes (non négociables)

| Sujet | Contrainte |
|---|---|
| Plateforme | **PWA** installée sur l'écran d'accueil d'un **iPhone 13** (Safari/iOS récent). Pas de Mac, pas de Xcode, pas d'appli native. |
| Coût | **Gratuit**. Aucun serveur payant, aucune API payante. |
| Backend | **Aucun backend propre.** Tout est local (IndexedDB). Seul appel réseau : l'API d'IA. |
| Hébergement | **GitHub Pages** (statique, HTTPS). Le build doit fonctionner sous un sous-chemin (`/nom-du-repo/`). |
| Usage | Un seul utilisateur, hors-ligne possible pour tout sauf l'extraction IA. |
| Import vidéo | La vidéo est déjà enregistrée dans Photos/Fichiers (via une autre appli). L'appli la charge avec un sélecteur de fichier. Elle ne télécharge **rien** depuis Instagram/TikTok. |
| Secrets | La clé API est saisie par l'utilisateur dans les réglages et stockée **localement**. Jamais dans le code ni dans le dépôt Git. |

## 3. Nom de l'appli

**Carmy.** Utilisé dans le titre de la page, le nom sous l'icône de l'écran d'accueil (`apple-mobile-web-app-title`), le manifest (`name` / `short_name`), l'en-tête de l'appli et le nom du fichier d'export (`carmy-sauvegarde-AAAA-MM-JJ.json`). L'icône est à créer (voir §10).

## 4. Stack recommandée (modifiable si justifié)

- **Vite + TypeScript + Preact**, build statique, `base` configurable pour GitHub Pages.
- **vite-plugin-pwa** (manifest + service worker, précache de l'appli → fonctionne hors-ligne).
- **IndexedDB** via la librairie `idb` pour les données et les blobs (miniatures, vidéos en file d'attente).
- **Vitest** pour les tests unitaires de la logique pure (fusion d'ingrédients, conversions d'unités, mise à l'échelle des portions).
- Pas de framework CSS lourd : CSS maison avec variables (thème §10).
- Déploiement : GitHub Actions → GitHub Pages.

## 5. Parcours principal

1. Onglet **Ajouter** → l'utilisateur choisit une vidéo (ou colle un texte, ou saisit à la main).
2. (Optionnel) Il colle le **lien du post d'origine**, conservé comme référence.
3. L'appli extrait une miniature, envoie la vidéo à l'IA, reçoit un JSON structuré.
4. **Écran de relecture obligatoire** : l'utilisateur corrige tout champ puis valide. Rien n'est enregistré avant validation.
5. La recette entre dans la **bibliothèque**.
6. Onglet **Courses** : il sélectionne des recettes, règle les portions, l'appli génère la liste fusionnée, triée par rayon.
7. En cuisine : **mode étape par étape** avec minuteurs.

## 6. Fonctionnalités V1

### F1 — Ajout de recette
- **F1.1 Vidéo importée** : `<input type="file" accept="video/*">` (ouvre Photos/Fichiers sur iOS). Pas de limite de durée imposée, mais avertir au-delà de ~3 min (coût/quota).
- **F1.2 Texte collé** : zone de texte (légende, description) → même extraction IA, sans vidéo.
- **F1.3 Saisie manuelle** : formulaire complet sans IA (mêmes champs que la relecture).
- **F1.4 Lien d'origine** (optionnel) : champ texte, affiché sur la fiche sous forme de lien cliquable.
- **F1.5 Miniature** : extraite côté client d'une image de la vidéo (~1 s, ou milieu), JPEG ~400 px de large, qualité 0,7. La **vidéo n'est jamais conservée** après succès (seulement miniature + lien).

### F2 — Extraction par IA
- Fournisseur initial : **API Gemini** (quota gratuit), appelée **directement depuis le navigateur** avec la clé de l'utilisateur.
- Les vidéos < ~15 Mo peuvent être envoyées en ligne (base64). Au-delà : **Files API** (envoi « resumable », attendre l'état `ACTIVE`, puis `generateContent` avec `fileData`, puis supprimer le fichier).
- Sortie en **JSON contraint par schéma** (`responseMimeType: application/json` + `responseSchema`).
- Le modèle utilisé est un **réglage** (liste de modèles Flash gratuits à vérifier dans AI Studio) — ne pas le figer dans le code.
- **Abstraction obligatoire** : interface `ExtractionProvider { extract(input): Promise<ExtractedRecipe> }`. Gemini est la seule implémentation en V1 ; prévoir qu'on puisse en ajouter une autre sans toucher au reste (voir risques §14).
- Le prompt et le schéma sont spécifiés au §8.

### F3 — Relecture / validation
- Écran éditable : titre, portions, temps (préparation/cuisson), tags, ingrédients (quantité, unité, nom, rayon, note), étapes (texte + minuteur éventuel), lien d'origine, miniature.
- Ajout / suppression / réordonnancement des lignes d'ingrédients et d'étapes.
- Si l'IA indique `isRecipe: false`, afficher « Aucune recette détectée » et proposer la saisie manuelle ou un nouveau texte.
- Boutons : **Enregistrer** / **Annuler**.

### F4 — Bibliothèque
- Liste en cartes (miniature, titre, temps, tags). **Recherche** plein texte (titre, ingrédients, tags).
- **Tags / catégories** : libres, avec suggestions (entrée, plat, dessert, rapide, végétarien, etc.). Filtrage par tag.
- **Collections** : dossiers personnalisés (créer, renommer, supprimer). Une recette peut appartenir à plusieurs collections.
- **Fiche détail** : ingrédients mis à l'échelle selon un sélecteur de **portions** (défaut : **1 personne**, réglable), étapes, lien d'origine, boutons Modifier / Supprimer (avec confirmation) / Mode cuisine / Ajouter aux courses.

### F5 — Mode cuisine
- Plein écran, **une étape à la fois** en grand texte, navigation par swipe et boutons précédent/suivant, rappel des ingrédients accessible.
- **Minuteurs** : si une étape a `timerSeconds`, un bouton lance un compte à rebours ; plusieurs minuteurs simultanés possibles.
- Limites iOS à respecter (voir §11) : pas de notification en arrière-plan. À l'échéance, signal **sonore + visuel** dans l'appli. Activer l'**API Wake Lock** tant qu'un minuteur tourne ou que le mode cuisine est ouvert (recommandé même si non demandé explicitement, sinon l'écran se verrouille et le minuteur devient inutile).

### F6 — Liste de courses
- Sélection d'une ou plusieurs recettes, avec **portions ajustables par recette** (défaut 1).
- **Fusion des doublons** + **conversion d'unités** (règles au §9).
- **Tri par rayon** (rayons au §8), sections repliables.
- **Garde-manger** : liste configurable d'ingrédients « déjà à la maison » (sel, poivre, huile, sucre, farine, eau…). Ils ne s'affichent pas dans la liste principale mais dans une section repliée « Déjà à la maison », d'où l'utilisateur peut en ajouter un en un tap.
- **Cases à cocher** (mode magasin) ; l'état est sauvegardé. Les articles cochés descendent en bas de leur rayon.
- **Ajout manuel** d'articles hors recettes (nom, quantité optionnelle, rayon).
- Boutons : décocher tout, supprimer les articles cochés, vider la liste.
- Non demandé en V1 : partage vers Rappels, copie en texte.

### F7 — File d'attente d'extraction
- Si l'appel échoue (quota atteint, réseau, vidéo trop longue, erreur API) : la **vidéo (Blob) est conservée dans IndexedDB** dans une file « En attente » avec le message d'erreur.
- L'utilisateur relance en **un tap** sans réimporter. Pas de relance automatique agressive (le quota journalier se réinitialise à heure fixe).
- La vidéo est supprimée de la file dès que la recette est validée. Option « Supprimer » par élément.

### F8 — Sauvegarde / restauration
- **Export** : un fichier JSON unique (recettes, collections, tags, garde-manger, réglages **sauf la clé API**), partagé via la feuille de partage iOS ou téléchargé, à ranger dans Fichiers/iCloud. Les miniatures sont incluses (base64).
- **Import** : sélection du fichier, choix « Remplacer » ou « Fusionner », avec aperçu du nombre d'éléments.
- **Rappel** : bannière si aucune sauvegarde depuis 14 jours ou si plus de 10 recettes ont été ajoutées depuis la dernière.
- Demander `navigator.storage.persist()` au premier lancement.

### F9 — Réglages
Clé API (champ masqué, bouton « Tester la clé »), modèle IA, portions par défaut (1), garde-manger, export/import, aide « Installer sur l'écran d'accueil », version.

## 7. Modèle de données (TypeScript)

```ts
type Aisle = 'fruits_legumes' | 'boucherie_poissonnerie' | 'cremerie_oeufs' | 'boulangerie'
  | 'epicerie_salee' | 'epicerie_sucree' | 'surgeles' | 'boissons' | 'condiments_epices' | 'autre';

type Unit = 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'c_cafe' | 'c_soupe' | 'piece'
  | 'pincee' | 'gousse' | 'tranche' | 'sachet' | 'boite' | 'bouquet' | null;

interface Ingredient {
  name: string;          // nom canonique : français, minuscule, singulier (« oignon »)
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  note?: string;         // « émincé », « à température ambiante »
  optional?: boolean;
}
interface Step { text: string; timerSeconds?: number | null; }

interface Recipe {
  id: string;
  title: string;
  servings: number;          // portions de base de la fiche
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  tags: string[];
  collectionIds: string[];
  ingredients: Ingredient[];
  steps: Step[];
  sourceType: 'video' | 'text' | 'manual';
  sourceUrl?: string;
  thumbnail?: Blob;          // ou data URL
  createdAt: number; updatedAt: number;
}
interface Collection { id: string; name: string; }

interface ShoppingItem {
  id: string; name: string; quantity: number | null; unit: Unit; aisle: Aisle;
  checked: boolean; origin: 'recipe' | 'manual'; recipeIds: string[];
}
interface ShoppingState { selections: { recipeId: string; servings: number }[]; manualItems: ShoppingItem[]; checkedKeys: string[]; }

interface PantryItem { name: string; }
interface QueueJob { id: string; kind: 'video'; blob: Blob; sourceUrl?: string; status: 'pending'|'error'; error?: string; attempts: number; createdAt: number; }
interface Settings { apiKey?: string; model: string; defaultServings: number; lastBackupAt?: number; recipesSinceBackup: number; }
```

La liste de courses est **recalculée** à partir de `selections` + `manualItems` + garde-manger ; seul l'état coché est persisté (clé = `name|unit`).

## 8. Extraction IA : prompt et schéma

**Instructions système (à adapter) :**
- Tu extrais UNE recette de cuisine à partir d'une vidéo (parole, texte incrusté, légende) ou d'un texte.
- N'invente rien. Si une quantité n'est pas donnée, mets `null`. Ignore les sponsors, abonnements et bavardages.
- **Traduis tout en français**, quelle que soit la langue source.
- Rends les ingrédients avec un **nom canonique** (français, minuscule, singulier, sans quantité ni préparation : « oignon », pas « 2 oignons émincés »). La préparation va dans `note`.
- Utilise uniquement les unités et rayons de l'énumération. Convertis « cuillère à soupe » → `c_soupe`, etc.
- Si la vidéo ne contient pas de recette, renvoie `isRecipe: false`.
- Pour chaque étape contenant une durée explicite (« laisser cuire 10 minutes »), renseigne `timerSeconds`.
- Si plusieurs recettes apparaissent, extrais la principale.

**Schéma de sortie :**
```json
{
  "isRecipe": true,
  "title": "string",
  "servings": 2,
  "prepMinutes": 15,
  "cookMinutes": 20,
  "tags": ["plat", "rapide"],
  "ingredients": [
    { "name": "oignon", "quantity": 2, "unit": "piece", "aisle": "fruits_legumes", "note": "émincé", "optional": false }
  ],
  "steps": [ { "text": "…", "timerSeconds": 600 } ],
  "detectedLanguage": "en"
}
```
Valider la réponse côté client (types, énumérations). En cas de JSON invalide : une nouvelle tentative, puis erreur → file d'attente.

## 9. Règles de la liste de courses

1. **Mise à l'échelle** : `quantité × (portions voulues ÷ portions de la fiche)`. Arrondir intelligemment (pièces à 0,5 près, grammes à l'unité, pas de « 0,333 oignon » affiché brut ; afficher « ½ », « ¼ » si possible).
2. **Clé de fusion** : `name` canonique + famille d'unité.
3. **Conversions pour fusionner** : poids → g (`kg × 1000`) ; volume → ml (`cl × 10`, `l × 1000`, `c_soupe = 15 ml`, `c_cafe = 5 ml`). Après somme, reconvertir à l'affichage dans l'unité la plus lisible (1500 g → 1,5 kg ; 250 ml → 25 cl uniquement si l'utilisateur préfère, sinon ml/l).
4. **Pas de conversion poids ↔ pièces** ni poids ↔ volume (pas de densité). Ces lignes restent séparées (« oignon 300 g » et « oignon 2 pièces »). Les quantités `null` produisent une ligne sans quantité ; si l'ingrédient existe déjà avec quantité, garder les deux lignes.
5. **Garde-manger** : tout ingrédient dont le nom canonique est dans le garde-manger est placé dans la section « Déjà à la maison ».
6. Chaque ligne conserve la liste des recettes sources (affichable au tap).
7. Tests unitaires obligatoires sur toutes ces règles (cas : doublons, unités mixtes, null, portions fractionnaires).

## 10. Design et UX

- **Ambiance : chaleureuse et gourmande.** Gros visuels (miniatures), coins arrondis généreux, accents de couleur chaude.
- **Palette proposée** : crème `#FFF7EC` (fond), terracotta `#D9532B` (accent principal), safran `#F2A93B` (secondaire), basilic `#4F7F52` (succès/coché), brun `#3B2A20` (texte). Contraste texte ≥ AA.
- **Typo** : titres avec `ui-serif` (New York sur iOS), texte avec `-apple-system`. Aucune police à télécharger.
- **Navigation** : barre d'onglets en bas — **Recettes · Ajouter · Courses · Réglages**. Zones tactiles ≥ 44 px, gestion des `safe-area-inset`.
- **Pas de thème sombre** en V1 (hors périmètre).
- **Icône** : créer une icône originale (pas de fourchette/couteau générique copiée d'une autre appli), fournir `apple-touch-icon` 180×180 et icônes PWA 192/512.
- États vides soignés, retours visuels sur les actions longues (progression d'extraction : « envoi… », « analyse… », « mise en forme… »).

## 11. Contraintes iOS / PWA à anticiper

- Installation manuelle : Safari → Partager → *Sur l'écran d'accueil* (fournir une page d'aide). Balises `apple-mobile-web-app-capable`, `apple-touch-icon`, `viewport-fit=cover`.
- **Web Share Target non supporté** sur iOS : l'import passe uniquement par le sélecteur de fichier.
- **Pas de notifications locales en arrière-plan** sans serveur de push : les minuteurs ne sonnent que si l'appli est ouverte (d'où le Wake Lock).
- Vibration non supportée sur Safari iOS : ne pas compter dessus.
- Stockage : l'appli installée n'est en principe pas purgée, mais demander la persistance et fournir l'export (F8).
- **Mémoire** : les gros fichiers vidéo doivent être traités en flux/Blob, pas convertis en chaînes inutilement. Limiter la file d'attente (ex. 5 vidéos max).
- Service worker : mise à jour propre (message « nouvelle version disponible »).
- Sous-chemin GitHub Pages : `start_url` et `scope` du manifest relatifs au `base`.

## 12. Hors périmètre V1 (à ne pas construire)

Planning de repas / semainier · favoris · notes perso et historique « déjà cuisinée » · photo/capture d'écran en entrée · import par lien de site web · écran toujours allumé *hors* mode cuisine · coche des ingrédients en mode cuisine · partage/copie de la liste de courses · thème sombre · comptes et synchro en ligne.

## 13. Idées pour la V2

Calories / valeurs nutritionnelles par portion · « Que cuisiner avec ce que j'ai » (recherche par ingrédients disponibles) · et, si l'envie revient : favoris, planning, partage de la liste vers Rappels.

## 14. Risques et points à valider tôt

| # | Risque | Action |
|---|---|---|
| R1 | **CORS / Files API depuis le navigateur** : à confirmer dès le jalon 1. | Tester l'envoi résumable et `generateContent` depuis Safari iOS. Repli : n'accepter que les vidéos < ~15 Mo en envoi en ligne, ou réduire la vidéo avant envoi. |
| R2 | **Quota gratuit** insuffisant ou modifié. | Lire les limites actuelles dans AI Studio ; la file d'attente (F7) absorbe les dépassements ; fournisseur interchangeable. |
| R3 | **Conditions d'utilisation** de l'API Gemini : leurs conditions (mars 2026) indiquent de n'utiliser que des services payants pour les clients API mis à disposition d'utilisateurs dans l'EEE/Suisse/Royaume-Uni et destinent l'API à un usage professionnel. Usage perso solo = zone grise. | L'utilisateur assume ce risque en connaissance de cause ; l'abstraction `ExtractionProvider` permet de basculer (autre fournisseur, ou activation de la facturation avec plafond). |
| R4 | **Données envoyées à Google** sur l'offre gratuite (peuvent servir à améliorer leurs produits). | Acceptable pour des reels publics de recettes ; ne jamais envoyer de contenu personnel. |
| R5 | Qualité d'extraction variable (texte incrusté, accents, quantités à l'oral). | La relecture obligatoire (F3) est le filet de sécurité ; mesurer au jalon 1. |
| R6 | Clé API stockée en clair dans le navigateur. | Acceptable pour un usage perso sur son propre appareil ; ne jamais l'inclure dans l'export ; conseiller de restreindre la clé dans la console Google si possible. |

## 15. Plan de livraison (jalons)

| Jalon | Contenu | Critère de sortie |
|---|---|---|
| **J0** | Dépôt, Vite + Preact + TS, PWA installable, déploiement GitHub Pages via Actions | L'appli s'ouvre depuis l'écran d'accueil de l'iPhone, hors-ligne OK |
| **J1** | **Prototype d'extraction** (page unique) : saisie de clé, choix d'une vidéo, appel Gemini, affichage de la fiche | Test sur **5 vidéos réelles** (2 Instagram, 2 TikTok, 1 avec texte incrusté uniquement). Go/no-go sur R1, R2, R5 |
| **J2** | Modèle de données, IndexedDB, saisie manuelle, texte collé, écran de relecture, enregistrement | Recette créée, relue, enregistrée, retrouvée après redémarrage |
| **J3** | Bibliothèque : recherche, tags, collections, fiche détail, portions, édition, suppression | Parcours complet sans IA possible |
| **J4** | Mode cuisine : étape par étape, minuteurs, Wake Lock | Utilisable les mains sales, minuteurs fiables écran allumé |
| **J5** | Liste de courses : sélection, portions, fusion, conversions, rayons, garde-manger, cases, ajout manuel (+ tests unitaires) | Cas de test du §9 verts |
| **J6** | File d'attente, export/import, rappel de sauvegarde, réglages | Une extraction échouée se relance en un tap ; un export se réimporte à l'identique |
| **J7** | Polish (thème gourmand, icône, états vides, accessibilité), page d'aide d'installation, README | Test final sur l'iPhone 13 |

### Critères d'acceptation de l'extraction (J1)
Sur les 5 vidéos de test : titre pertinent ; ≥ 90 % des ingrédients présents ; quantités correctes sur ≥ 80 % des ingrédients renseignés ; aucune recette « inventée » ; texte entièrement en français ; un cas `isRecipe: false` géré proprement.

## 16. Consignes de travail pour Claude Code

- Travailler par jalons, un commit par fonctionnalité, messages clairs.
- TypeScript en mode strict ; la logique métier (fusion, conversions, échelle) est **pure et testée**, séparée de l'interface.
- Ne jamais écrire de clé ou de donnée personnelle dans le dépôt. Ajouter un `.gitignore` adapté.
- Ne pas ajouter de dépendance lourde sans raison ; privilégier le poids réduit (chargement mobile).
- Documenter dans le README : lancement local, déploiement GitHub Pages, installation sur iPhone, création de la clé API.
- Toute décision qui s'écarte de ce cahier des charges est signalée avant d'être appliquée.
- Les tests sur appareil réel sont faits par l'utilisateur : fournir à chaque jalon les étapes précises à tester.

## 17. Marche à suivre côté utilisateur (une fois)

1. Créer un compte GitHub (si besoin) et un dépôt pour le projet ; activer GitHub Pages (source : GitHub Actions).
2. Créer une clé API dans Google AI Studio ; relever les modèles gratuits et leurs limites.
3. Sur l'iPhone : ouvrir l'adresse de l'appli dans Safari → Partager → *Sur l'écran d'accueil*.
4. Dans Réglages de l'appli : coller la clé, choisir le modèle, tester.
