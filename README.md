# Carmy

Appli personnelle de recettes, en **PWA pour iPhone** : elle transforme une vidéo de recette (Instagram, TikTok), des captures d'écran, un texte collé ou une saisie manuelle en **fiche structurée**, la range dans une **bibliothèque**, propose un **mode cuisine** avec minuteurs et génère une **liste de courses** fusionnée par rayon.

- Gratuite, sans serveur : tout est stocké sur l'appareil (IndexedDB). Seul appel réseau : l'API Gemini, avec la clé de l'utilisateur (recettes et tickets de caisse).
- Fonctionne hors-ligne, sauf l'extraction par IA.
- Cahier des charges : [`docs/cahier-des-charges-carmy.md`](docs/cahier-des-charges-carmy.md).

**État : V1 (jalons J0 à J7) et V2 (V2-J1 à V2-J4, batch cooking) livrées ; 1.6.0 : onglet Stock, repas simples, mode Toulouse ; 1.7.0 : onglet Batch retiré ; 1.9.0 : scan de ticket de caisse ou de commande drive ; 1.10.0 : produits du stock modifiables (nom, emoji, quantité).**

### Feuille de route V2 (batch cooking)

| Jalon | Contenu | État |
|---|---|---|
| V2-J1 | Recette depuis une ou plusieurs captures d'écran | ✅ 1.1.0 |
| V2-J2a | Fiche enrichie : icône par ingrédient, conservation frigo/congélateur, valeurs nutritionnelles par portion, « Compléter avec l'IA » | ✅ 1.2.0 |
| V2-J2b | Session de batch cooking : recettes et portions, courses groupées, déroulé optimisé par l'IA (ou simple), mode cuisine de session, récapitulatif de conservation | ✅ 1.3.0 |
| V2-J3 | Réserve : plats cuisinés (portions, frigo/congélateur, dates limites) et produits achetés (quantités), « Ranger les courses », courses limitées au manque, déduction des ingrédients en fin de cuisson | ✅ 1.4.0 |
| V2-J4 | Planning de la semaine (midi et soir, 1 personne) : remplissage automatique depuis la réserve, rappels (décongeler, péremption, portions manquantes), confirmation des repas mangés | ✅ 1.5.0 |
| 1.6.0 | Onglet **Stock** (ex-réserve) alimenté dès qu'on coche un article des courses ; **repas simples** hors recette avec produits du stock retirés une fois le repas mangé ; **mode Toulouse** (déplacement : le stock n'est pas modifié) | ✅ 1.6.0 |
| 1.9.0 | **Scan de ticket de caisse ou de commande drive** (photos ou captures) : Gemini lit les produits et les quantités totales, relecture (cocher, corriger nom, quantité, unité, rayon), puis ajout au stock avec cumul des quantités | ✅ 1.9.0 |
| 1.10.0 | **Produits du stock modifiables à la main** : toucher un produit pour changer son nom, son emoji (choisi dans une grille ou tapé, « Auto » pour revenir à l'emoji automatique), sa quantité, son unité et son rayon ; renommé comme un produit existant, il s'y cumule | ✅ 1.10.0 |

## Fonctionnalités

| Onglet | Ce qu'on y fait |
|---|---|
| **Recettes** | Bibliothèque en cartes, recherche (titre, ingrédients, tags, sans accents), filtres par collection et par tags, collections (créer, renommer, supprimer). Fiche : icône par ingrédient, **conservation** (frigo, congélateur) et **valeurs nutritionnelles** par portion estimées par l'IA, portions ajustables avec quantités recalculées, ajout aux courses, mode cuisine, modification, suppression. |
| **Ajouter** | Vidéo (Photos ou Fichiers), **captures d'écran** (jusqu'à 10 par recette, ordre modifiable, choix de la miniature), texte collé ou saisie manuelle, lien du post d'origine. Extraction par Gemini, puis **relecture obligatoire** avant enregistrement. En cas d'échec, la vidéo ou les captures restent en **file d'attente** (5 max) et se relancent en un tap. |
| **Mode cuisine** | Plein écran, une étape à la fois, glisser pour changer d'étape, ingrédients à portée, minuteurs multiples (pause, +1 min), alarme sonore et visuelle, écran maintenu allumé. |
| **Semaine** | Planning du lundi au dimanche, midi et soir : plats cuisinés du stock, recettes à cuisiner ou **repas simple** hors recette (nom + produits du stock et quantités utilisées, réservés puis retirés quand le repas est mangé) ; « Remplir avec le stock » (ce qui périme d'abord, congélateur à partir du lendemain) ; rappels (sortir du congélateur la veille, plat périmé avant le repas, portions manquantes, « As-tu mangé … ? »). |
| **Stock** | Plats cuisinés au frigo et au congélateur (portions, « à manger avant », −1 portion, congeler/décongeler, ajout de restes) ; produits achetés avec leurs quantités, ajoutés automatiquement en cochant les courses, ajoutables à la main et **modifiables (nom, emoji, quantité, unité, rayon)**, ou lus sur un **ticket de caisse ou une commande drive** (📷 photo ou captures, relecture avant ajout) ; interrupteur **mode Toulouse** ; pastille des plats à manger vite. |
| **Courses** | Recettes choisies avec portions par recette, fusion des doublons et conversion d'unités, tri par rayon, garde-manger (« Déjà à la maison »), cases à cocher sauvegardées (**cocher = ajouter au stock, décocher = retirer**), ajout manuel. |
| **Réglages** | Clé API et modèle (avec tests), analyse rapide, portions par défaut, mode Toulouse, garde-manger, **sauvegarde / restauration**, aide, version. |

## Lancer en local

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir l'adresse affichée (par défaut `http://localhost:5173/`). Autres commandes :

```bash
npm test
```

```bash
npm run build
```

`npm run build` vérifie les types (TypeScript strict) puis produit le site statique dans `dist/`. Pour simuler GitHub Pages : `BASE_PATH=/Carmy/ npm run build`, puis `npm run preview`.

Le nom de l'appli est centralisé dans `src/config.ts`. Les icônes se régénèrent depuis `public/icons/icon.svg` avec `npm run icons` (nécessite Playwright).

## Déploiement sur GitHub Pages

1. Sur GitHub : **Settings › Pages › Source : GitHub Actions** (une seule fois).
2. Chaque push sur `main` lance `.github/workflows/deploy.yml` : installation, tests, build, publication.
3. L'appli est servie à `https://<compte>.github.io/<nom-du-depot>/` ; le sous-chemin est calculé automatiquement (`BASE_PATH`), ainsi que `start_url` et `scope` du manifest.
4. Une fois le déploiement terminé, l'appli installée affiche « Nouvelle version disponible » : toucher **Mettre à jour**.

## Installer sur l'iPhone

1. Ouvrir l'adresse de l'appli dans **Safari**.
2. **Partager › Sur l'écran d'accueil › Ajouter**.
3. Toujours ouvrir Carmy depuis l'icône : sur iOS, l'appli installée et l'onglet Safari ont des stockages séparés.

## Créer la clé API Gemini

1. Aller sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey) avec un compte Google, **Create API key**, copier la clé.
2. Dans Carmy : **Réglages › Réglages de l'IA**, coller la clé, **Tester la clé**, choisir un modèle « flash-lite », **Tester le modèle**.
3. La clé est stockée uniquement sur l'appareil, n'est jamais incluse dans les sauvegardes et ne doit jamais être commitée.

Bon à savoir :
- La clé AI Studio utilise l'**offre gratuite de l'API** (quota journalier). Un abonnement grand public Gemini (Google AI Pro / Ultra) ne s'y applique pas ; pour plus de quota, il faut activer la facturation de l'API sur le projet, idéalement avec un plafond.
- Sur l'offre gratuite, les contenus envoyés peuvent servir à Google pour améliorer ses produits : n'envoyer que des recettes publiques (risque R4).
- Conditions d'utilisation de l'API en zone EEE/Suisse/Royaume-Uni : voir le risque R3 du cahier des charges.

## Sauvegarde

**Réglages › Sauvegarde › Exporter** produit `carmy-sauvegarde-AAAA-MM-JJ.json` (recettes avec miniatures, collections, garde-manger, réglages, liste de courses — jamais la clé API), à ranger dans Fichiers ou iCloud Drive via la feuille de partage. **Importer** affiche un aperçu puis propose :
- **Fusionner** : ajoute ce qui manque ; pour une même recette, garde la version modifiée le plus récemment ;
- **Remplacer** : restaure exactement la sauvegarde (la clé API de l'appareil est conservée).

Un rappel s'affiche après 14 jours sans sauvegarde ou plus de 10 nouvelles recettes.

## Limites liées à iOS

- **Minuteurs** : ils ne sonnent que si l'appli est ouverte (pas de notification en arrière-plan sans serveur). Le décompte reste juste et l'alarme sonne au retour. L'écran est maintenu allumé (Wake Lock) pendant le mode cuisine.
- L'alarme est lue comme un média : elle sonne même avec le bouton silencieux. La vibration n'existe pas sur Safari iOS.
- Pas d'import direct depuis Instagram/TikTok (Web Share Target non supporté) : enregistrer d'abord la vidéo dans Photos.
- Le stockage est local : penser à exporter régulièrement.

## Structure du code

```
src/
  config.ts            nom de l'appli
  app.tsx, router.ts   coquille, onglets, navigation par ancre (#/…)
  model/               logique pure, testée : types (§7), brouillon de relecture, portions,
                       recherche, liste de courses (§9), minuteurs, sauvegarde, stock, ticket de caisse
  extraction/          ExtractionProvider, implémentation Gemini, prompt et schéma (§8), validation
  db/db.ts             IndexedDB (idb) : recettes, collections, réglages, courses, garde-manger, file d'attente
  media/               miniature vidéo, alarme (WAV généré), Wake Lock
  timers/              état global des minuteurs et alarme
  pages/, components/  interface (Preact)
tests/                 Vitest (logique pure + IndexedDB simulée)
```

Stack : Vite, TypeScript strict, Preact, vite-plugin-pwa (service worker, hors-ligne), idb, Vitest. Aucune police ni dépendance lourde : environ 40 Ko de JavaScript compressé.

## Écarts au cahier des charges

Signalés au fil des jalons et validés à l'usage :

- **Palette** : basilic `#466F49` (au lieu de `#4F7F52`) et fond des boutons `#C4461E` (au lieu de `#D9532B`) pour respecter le contraste AA ; le terracotta d'origine reste utilisé pour les éléments décoratifs.
- **Réglages** : ajout de « Analyse rapide » (vidéo lue en basse résolution, plus rapide) et « Toujours passer par la Files API » (test du risque R1).
- **Extraction** : réponse en flux, durée maximale par étape, bascule automatique sur le modèle suggéré par Google si le modèle choisi est retiré.
- **Liste de courses** : l'état coché est mémorisé par ingrédient et famille d'unité (et non par unité exacte), pour survivre au passage « 900 g » → « 1,2 kg » ; le stockage mémorise aussi les lignes supprimées et les articles du garde-manger ajoutés quand même.
- **File d'attente** : chaque vidéo garde aussi son nom de fichier et sa miniature.
- **Sauvegarde** : inclut aussi la liste de courses.
- **Minuteurs** : continuent hors du mode cuisine (pastilles de rappel) et survivent à un rechargement.

### Évolutions V2 (hors périmètre V1, demandées par l'utilisatrice)

- **Captures d'écran en entrée** (V2-J1, listé « hors périmètre V1 » au §12) : nouvelle source `image`. Les captures sont recompressées sur l'iPhone (JPEG, 2048 px maximum) avant envoi, envoyées en une seule requête (Files API au-delà de 14 Mo), dans l'ordre choisi. L'« analyse rapide » (basse résolution) ne s'applique pas aux captures, pour que le texte reste lisible. La miniature est recadrée au format 4:5 des cartes. Les captures ne sont pas conservées après l'enregistrement, comme les vidéos (F1.5), mais un lot en échec est gardé dans la file d'attente.
- **Fiche enrichie** (V2-J2a, inspirée fonctionnellement de l'appli Basta, sans reprise de visuels) : champs facultatifs `storage` (`fridgeDays`, `freezerMonths`, 0 = congélation déconseillée) et `nutrition` (kcal, protéines, glucides, lipides, fibres par portion), estimés par l'IA dans la même requête que l'extraction (schéma §8 étendu) ou après coup (« Compléter avec l'IA » : requête texte, ne remplace jamais une valeur existante). Icônes d'ingrédients : emoji Unicode choisis localement par mots-clés (`model/icons.ts`), repli sur le rayon, sans IA. Pas de migration IndexedDB (champs facultatifs).
- **Session de batch cooking** (V2-J2b) : nouvel onglet « Batch » (5 onglets). Une seule session à la fois, stockée dans `kv` (`batch`), **non incluse dans la sauvegarde** (données de travail ; la réserve du V2-J3 le sera). Le déroulé IA est validé (chaque recette doit apparaître) avec un nouvel essai si besoin. Le mode cuisine est désormais un composant générique (`CookView`) partagé par une recette et une session ; les minuteurs de session ont l'identifiant `batch`.
- **Réserve** (V2-J3) : nouvel onglet (6 onglets). Produits (`kv` `stock`) stockés en unité de base de leur famille (g, ml, nombre), cumulés par nom + famille d'unité comme la liste de courses ; plats (`kv` `dishes`) avec lieu et date limite. « Ranger les courses » (bouton plutôt qu'ajout automatique à la coche, choix de l'utilisatrice) ajoute les articles cochés avec une quantité modifiable. La liste de courses n'affiche que la quantité manquante et range dans « Déjà à la maison » ce qui est couvert. En fin de cuisson (recette ou session), une feuille propose la répartition frigo/congélateur (2 repas par jour pour 1 personne) et la déduction des ingrédients, désactivable. Le **garde-manger est conservé** comme liste de basiques jamais décomptés. Réserve incluse dans la sauvegarde (champs facultatifs, format 1 inchangé).
- **Planning** (V2-J4) : l'onglet Réserve devient **« Semaine »** (planning en haut, réserve en dessous ; `#/reserve` reste valable), pour garder 6 onglets — choix de l'utilisatrice. Repas en `kv` `planning` (jour local, midi/soir, lien facultatif vers un plat ou une recette, état mangé), oubliés après 4 semaines, inclus dans la sauvegarde (fusion : un créneau déjà prévu n'est jamais remplacé). Remplissage automatique déterministe, sans IA. Un repas n'est marqué mangé qu'avec confirmation (pas de décompte automatique à l'heure du repas).
- **Ticket de caisse ou commande drive** (1.9.0) : bouton « 📷 Scanner un ticket » en haut de l'onglet Stock. Photos (appareil photo) ou captures, recompressées en JPEG 3072 px maximum (un ticket long garde ses petits caractères), envoyées en une requête Gemini (`extractReceipt`, schéma `RECEIPT_SCHEMA`). Gemini renvoie pour chaque produit le libellé du ticket, un nom canonique sans marque, la **quantité totale** (multipliée par le nombre d'articles, poids pesé, sinon pièces) et le rayon ; on lui envoie les noms déjà connus (stock, ingrédients des recettes, garde-manger, 400 au plus) pour qu'il les reprenne et que les quantités se cumulent. Relecture obligatoire (`model/receipt.ts`) : produits non alimentaires décochés, indication « s'ajoute au stock existant » ou « autre unité : ajouté à part ». Ajout par `addToStock`. Désactivé en mode Toulouse. Les images ne sont pas conservées et un échec ne passe pas par la file d'attente.

## Bilan du jalon 1 (09/11/2026)

- **Go** : extraction validée sur iPhone 13 avec le modèle **`gemini-3.5-flash-lite`**.
- **R1 (Files API depuis Safari iOS)** : OK — envoi résumable, attente `ACTIVE` et analyse fonctionnent.
- **Écueils rencontrés** : `gemini-2.5-flash` est refusé aux nouveaux comptes (bascule automatique sur le modèle suggéré par Google) ; avec `gemini-3.8-flash`, aucune réponse en 4 min sur une vidéo d'1 min.
- Le modèle reste un réglage (bouton « Tester le modèle » pour mesurer la latence).
