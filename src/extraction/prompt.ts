import { AISLES, UNITS } from './types';

export const SYSTEM_INSTRUCTION = `Tu es un assistant culinaire. Tu extrais UNE recette de cuisine à partir d'une vidéo (parole, texte incrusté à l'écran, légende) ou d'un texte.

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
- "detectedLanguage" : code ISO 639-1 de la langue d'origine (ex. "fr", "en", "es").`;

export const USER_PROMPT_VIDEO = 'Extrais la recette de cette vidéo, en tenant compte de ce qui est dit, de ce qui est montré et du texte affiché à l\'écran.';
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
  },
  required: ['isRecipe', 'title', 'servings', 'tags', 'ingredients', 'steps'],
  propertyOrdering: ['isRecipe', 'title', 'servings', 'prepMinutes', 'cookMinutes', 'tags', 'ingredients', 'steps', 'detectedLanguage'],
} as const;
