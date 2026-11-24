import { AISLES, UNITS } from './types';

/** Règles des estimations (V2-J2), partagées entre l'extraction et « Compléter avec l'IA ». */
const DETAILS_RULES = `- "storage" : conservation conseillée du plat une fois cuisiné, en boîte hermétique. "fridgeDays" = nombre de jours au réfrigérateur ; "freezerMonths" = nombre de mois au congélateur, 0 si la congélation est déconseillée (crudités, plats à base de crème ou d'œufs crus qui se tiennent mal…). Sois prudent (sécurité alimentaire) : estime selon les ingrédients les plus fragiles (poisson, fruits de mer, œufs, riz cuit).
- "nutrition" : estimation des valeurs nutritionnelles pour UNE portion (le total de la recette divisé par "servings") : "kcal", et en grammes "protein", "carbs" (glucides), "fat" (lipides), "fiber" (fibres). Nombres entiers. Si une quantité manque, estime une quantité habituelle.`;

export const SYSTEM_INSTRUCTION = `Tu es un assistant culinaire. Tu extrais UNE recette de cuisine à partir d'une vidéo (parole, texte incrusté à l'écran, légende), d'une ou plusieurs captures d'écran, ou d'un texte.

Règles :
- N'invente rien. Si une quantité n'est pas donnée, mets null. Si une information est absente, mets null.
- Ignore les sponsors, les appels à s'abonner, les codes promo et les bavardages.
- Traduis TOUT en français (titre, ingrédients, notes, étapes, tags), quelle que soit la langue d'origine.
- Chaque ingrédient a un nom canonique : français, en minuscules, au singulier, sans quantité ni préparation (« oignon », pas « 2 oignons émincés »). La préparation va dans "note".
- Utilise uniquement ces unités : ${UNITS.join(', ')}, ou null. Convertis : « cuillère à soupe »/tbsp → c_soupe ; « cuillère à café »/tsp → c_cafe ; un élément compté (œuf, oignon…) → piece. Les « cups » et « oz » doivent être convertis en ml ou en g.
- Utilise uniquement ces rayons : ${AISLES.join(', ')}.
- Pour chaque étape contenant une durée explicite (« laisser cuire 10 minutes »), renseigne timerSeconds (en secondes) ; sinon null.
- "servings" = nombre de portions indiqué ; s'il n'est pas indiqué, estime-le raisonnablement (entier ≥ 1).
- "tags" : 1 à 4 tags courts en français parmi par exemple entrée, plat, dessert, apéritif, petit-déjeuner, boisson, rapide, végétarien, vegan, sans gluten.
- Si plusieurs recettes apparaissent, extrais la principale.
- Si le contenu ne contient pas de recette de cuisine, renvoie isRecipe: false avec un titre vide et des listes vides.
- "detectedLanguage" : code ISO 639-1 de la langue d'origine (ex. "fr", "en", "es").
${DETAILS_RULES}`;

export const USER_PROMPT_VIDEO = 'Extrais la recette de cette vidéo, en tenant compte de ce qui est dit, de ce qui est montré et du texte affiché à l\'écran.';
/** Consigne pour un lot de captures d'écran : elles forment une seule recette, dans l'ordre donné. */
export function userPromptImages(count: number): string {
  return count > 1
    ? `Ces ${count} captures d'écran, numérotées dans l'ordre de lecture, montrent UNE SEULE recette (par exemple les ingrédients sur l'une et les étapes sur les suivantes). Assemble-les en une seule fiche : garde l'ordre des étapes, ne répète pas un ingrédient ou une étape visible sur deux captures qui se chevauchent, et ignore l'interface de l'appli (heure, boutons, commentaires, mentions « j'aime »).`
    : 'Extrais la recette de cette capture d\'écran. Ignore l\'interface de l\'appli (heure, boutons, commentaires, mentions « j\'aime »).';
}
export const DETAILS_INSTRUCTION = `Tu es un assistant culinaire et nutritionnel. On te donne une recette déjà structurée (JSON). Estime uniquement :
${DETAILS_RULES}`;

export const DETAILS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    storage: {
      type: 'OBJECT',
      properties: { fridgeDays: { type: 'INTEGER', nullable: true }, freezerMonths: { type: 'INTEGER', nullable: true } },
      required: ['fridgeDays', 'freezerMonths'],
      propertyOrdering: ['fridgeDays', 'freezerMonths'],
    },
    nutrition: {
      type: 'OBJECT',
      properties: {
        kcal: { type: 'INTEGER', nullable: true },
        protein: { type: 'INTEGER', nullable: true },
        carbs: { type: 'INTEGER', nullable: true },
        fat: { type: 'INTEGER', nullable: true },
        fiber: { type: 'INTEGER', nullable: true },
      },
      required: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
      propertyOrdering: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
    },
  },
  required: ['storage', 'nutrition'],
  propertyOrdering: ['storage', 'nutrition'],
} as const;

export const USER_PROMPT_TEXT = 'Extrais la recette du texte suivant :\n\n';

/** Schéma de sortie au format OpenAPI accepté par Gemini (responseSchema). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isRecipe: { type: 'BOOLEAN' },
    title: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    prepMinutes: { type: 'INTEGER', nullable: true },
    cookMinutes: { type: 'INTEGER', nullable: true },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', enum: [...UNITS], nullable: true },
          aisle: { type: 'STRING', enum: [...AISLES] },
          note: { type: 'STRING', nullable: true },
          optional: { type: 'BOOLEAN' },
        },
        required: ['name', 'quantity', 'unit', 'aisle'],
        propertyOrdering: ['name', 'quantity', 'unit', 'aisle', 'note', 'optional'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          timerSeconds: { type: 'INTEGER', nullable: true },
        },
        required: ['text'],
        propertyOrdering: ['text', 'timerSeconds'],
      },
    },
    detectedLanguage: { type: 'STRING', nullable: true },
    storage: { ...DETAILS_SCHEMA.properties.storage, nullable: true },
    nutrition: { ...DETAILS_SCHEMA.properties.nutrition, nullable: true },
  },
  required: ['isRecipe', 'title', 'servings', 'tags', 'ingredients', 'steps'],
  propertyOrdering: ['isRecipe', 'title', 'servings', 'prepMinutes', 'cookMinutes', 'tags', 'ingredients', 'steps', 'detectedLanguage', 'storage', 'nutrition'],
} as const;

/** V2-J2b : déroulé d'une session de batch cooking (plusieurs recettes cuisinées en une fois, pour 1 personne). */
export const BATCH_INSTRUCTION = `Tu es un chef spécialiste du batch cooking. On te donne plusieurs recettes (JSON, avec un "index") à cuisiner en une seule session, avec les quantités déjà calculées. Construis UN déroulé unique, le plus court possible, pour une personne seule dans une cuisine domestique (4 feux, 1 four).

Règles :
- Commence par ce qui est long et sans surveillance (préchauffer le four, faire cuire légumineuses, céréales, mijotés, rôtis), puis avance les préparations des autres recettes pendant ces cuissons.
- Regroupe les tâches identiques entre recettes (éplucher et émincer tous les oignons en une fois, peser les épices…) et indique pour quelles recettes et en quelles quantités (« Émincer 3 oignons : 2 pour le chili, 1 pour le curry »).
- Chaque étape = une action claire, en français, au tutoiement, en reprenant les quantités. N'invente pas d'ingrédient. Garde toutes les étapes utiles de chaque recette.
- "recipes" = liste des index des recettes concernées par l'étape (au moins un). Chaque recette doit apparaître dans au moins une étape.
- "timerSeconds" = durée d'une cuisson ou d'une attente à minuter dans cette étape, sinon null.
- Termine par le refroidissement (2 h maximum à température ambiante) et la mise en boîtes hermétiques étiquetées, portion par portion.
- "totalMinutes" = durée totale estimée de la session, en minutes.`;

export const BATCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    totalMinutes: { type: 'INTEGER', nullable: true },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          recipes: { type: 'ARRAY', items: { type: 'INTEGER' } },
          timerSeconds: { type: 'INTEGER', nullable: true },
        },
        required: ['text', 'recipes', 'timerSeconds'],
        propertyOrdering: ['text', 'recipes', 'timerSeconds'],
      },
    },
  },
  required: ['totalMinutes', 'steps'],
  propertyOrdering: ['totalMinutes', 'steps'],
} as const;

/** 1.9.0 : ticket de caisse ou commande drive → produits à ranger dans le stock. */
export const RECEIPT_INSTRUCTION = `Tu lis un ticket de caisse de supermarché ou une commande drive / livraison (photo ou capture d'écran) et tu listes les produits achetés, pour les ranger dans le stock d'une cuisine.

Règles :
- Une ligne par produit acheté. Ignore tout ce qui n'est pas un produit : sacs, consignes, remises, bons de réduction, points ou cagnotte de fidélité, sous-totaux, total, TVA, moyen de paiement, frais de service ou de livraison, en-tête et pied du ticket, interface de l'appli (heure, boutons, bannières).
- Un produit retiré, remplacé ou indisponible dans une commande drive n'est pas compté ; un produit de remplacement l'est.
- "label" : le libellé tel qu'il est écrit sur le ticket (ex. « FROM BLC 0% 1KG »).
- "name" : nom canonique du produit pour une cuisine, en français, en minuscules, au singulier sauf usage (« pâtes », « lentilles »), SANS marque, SANS conditionnement ni quantité : « FROM BLC 0% 1KG » → « fromage blanc » ; « LDL OEUFS PA X6 » → « œuf » ; « PANZANI SPAGH 500G » → « spaghetti ». Décode les abréviations des tickets. Si on te donne une liste de noms déjà utilisés, reprends exactement l'un d'eux quand il s'agit du même produit.
- "quantity" et "unit" : la quantité TOTALE achetée.
  - Poids ou volume indiqué (sur le libellé ou par la pesée) : multiplie par le nombre d'articles et exprime-le en g, kg, ml, cl ou l (« 2 x PATES 500G » → 1 kg ; « TOMATE 0,856 kg » → 856 g ; « LAIT 6X1L » → 6 l).
  - Produit compté (œufs, yaourts, fruits ou légumes à la pièce, baguette, boîte de conserve sans poids lisible…) : nombre total de pièces, unité "piece" (« OEUFS X6 » acheté 2 fois → 12 piece).
  - Si rien ne permet de connaître la quantité, mets quantity null et unit null. N'invente pas de poids.
- Utilise uniquement ces unités : ${UNITS.join(', ')}, ou null.
- "aisle" : rayon parmi ${AISLES.join(', ')}.
- "food" : true pour un aliment ou une boisson ; false pour un produit non alimentaire (hygiène, entretien, cuisine jetable, animaux…).
- Si plusieurs images sont fournies, elles montrent les parties successives d'UN SEUL ticket ou d'UNE SEULE commande : ne compte pas deux fois une ligne visible sur deux images qui se chevauchent.
- Si l'image ne montre ni ticket de caisse ni commande de courses, renvoie isReceipt: false et une liste vide.`;

export const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isReceipt: { type: 'BOOLEAN' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', enum: [...UNITS], nullable: true },
          aisle: { type: 'STRING', enum: [...AISLES] },
          food: { type: 'BOOLEAN' },
        },
        required: ['label', 'name', 'quantity', 'unit', 'aisle', 'food'],
        propertyOrdering: ['label', 'name', 'quantity', 'unit', 'aisle', 'food'],
      },
    },
  },
  required: ['isReceipt', 'items'],
  propertyOrdering: ['isReceipt', 'items'],
} as const;

/** Consigne d'un ticket ; `knownNames` = produits déjà connus (stock, ingrédients des recettes) pour garder les mêmes noms. */
export function userPromptReceipt(count: number, knownNames: string[]): string {
  const what = count > 1
    ? `Ces ${count} images, dans l'ordre, montrent les parties successives d'un même ticket de caisse ou d'une même commande drive. Liste les produits achetés.`
    : 'Liste les produits achetés sur ce ticket de caisse ou cette commande drive.';
  return knownNames.length
    ? `${what}\n\nNoms de produits déjà utilisés dans l'appli (reprends-les à l'identique pour un même produit) : ${knownNames.join(', ')}.`
    : what;
}
