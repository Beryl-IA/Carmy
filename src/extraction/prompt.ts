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
