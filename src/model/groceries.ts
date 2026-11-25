// 1.12.0 : liste de courses hors recette — saisie rapide (« 2 kg pommes »), rayon deviné, suggestions, habituels.
// Logique pure, sans accès à la base.
import { parseQuantity } from './draft';
import { normalizeText } from './search';
import { unitFamily } from './shopping';
import type { StockItem } from './stock';
import { UNITS, type Aisle, type PantryItem, type Recipe, type RecentItem, type ShoppingItem, type ShoppingState, type Unit } from './types';

export type { RecentItem };

/** Article saisi rapidement, avant d'entrer dans la liste. */
export interface QuickItem {
  name: string;
  quantity: number | null;
  unit: Unit;
}

/** Nombre d'habituels gardés. */
export const RECENT_MAX = 30;

const UNIT_WORDS: Record<string, Exclude<Unit, null>> = {
  g: 'g', gr: 'g', gramme: 'g', grammes: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
  ml: 'ml', cl: 'cl', l: 'l', litre: 'l', litres: 'l',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', unite: 'piece', unites: 'piece',
  sachet: 'sachet', sachets: 'sachet', paquet: 'sachet', paquets: 'sachet',
  boite: 'boite', boites: 'boite', conserve: 'boite', conserves: 'boite',
  tranche: 'tranche', tranches: 'tranche', bouquet: 'bouquet', bouquets: 'bouquet',
  gousse: 'gousse', gousses: 'gousse',
};

/**
 * Lit une saisie rapide : « 2 kg pommes », « 500g de farine », « 6 œufs », « lait 1 l », « 1,5 l lait », « ½ pastèque », « lait ».
 * Sans quantité lisible, tout le texte est le nom.
 */
export function parseQuickItem(input: string): QuickItem | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const num = String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d*\s*[¼½¾⅓⅔⅛])`;
  const unitWord = String.raw`([a-zA-Zéèêàâîôûç.]+)`;
  // Quantité devant : « 2 kg pommes », « 500g de farine », « 6 œufs », « x3 citrons ».
  const before = new RegExp(String.raw`^x?${num}(?:\s*${unitWord}\.?\s+|\s+)(?:(?:de|d')\s*)?(.+)$`, 'i').exec(text);
  // Quantité derrière : « lait 1 l », « pommes x3 », « citrons (3) ».
  const after = new RegExp(String.raw`^(.+?)\s+\(?x?${num}\s*${unitWord}?\)?$`, 'i').exec(text);

  const build = (qText: string, unitText: string | undefined, name: string, trailing = false): QuickItem | null => {
    const q = parseQuantity(qText.replace(/\s+/g, ' ').replace(/\s*\/\s*/, '/'));
    if (q === undefined || q === null || !(q > 0)) return null;
    let unit: Unit = null;
    let n = name;
    if (unitText) {
      const u = UNIT_WORDS[normalizeText(unitText.replace(/\.$/, ''))] ?? (UNITS as readonly string[]).find((x) => x === unitText.toLowerCase()) as Unit | undefined;
      if (u) unit = u;
      else if (trailing) return null; // « pack de 6 bières » : on garde le texte tel quel.
      else n = `${unitText} ${name}`; // « 6 gros œufs » : « gros » n'est pas une unité.
    }
    n = n.replace(/^(?:de|d')\s*/i, '').trim();
    if (!n) return null;
    return { name: n.toLowerCase(), quantity: q, unit };
  };

  if (before) {
    const r = build(before[1]!, before[2], before[3]!);
    if (r) return r;
  }
  if (after) {
    const r = build(after[2]!, after[3], after[1]!, true);
    if (r) return r;
  }
  return { name: text.toLowerCase(), quantity: null, unit: null };
}

/** Rayons devinés par mots-clés (sans accents, mot entier, singulier ou pluriel). Le premier qui correspond gagne. */
const AISLE_RULES: [string[], Aisle][] = [
  [['surgele', 'glace', 'glacon', 'sorbet', 'pizza surgelee', 'frite'], 'surgeles'],
  [['eau', 'jus', 'soda', 'coca', 'limonade', 'sirop', 'biere', 'vin', 'cidre', 'champagne', 'cafe', 'the', 'tisane', 'infusion'], 'boissons'],
  [['pomme de terre', 'patate', 'tomate', 'oignon', 'echalote', 'ail', 'carotte', 'poivron', 'courgette', 'concombre', 'aubergine',
    'brocoli', 'chou', 'champignon', 'avocat', 'epinard', 'salade', 'laitue', 'roquette', 'mache', 'poireau', 'endive', 'fenouil',
    'celeri', 'asperge', 'courge', 'potiron', 'butternut', 'navet', 'radis', 'betterave', 'haricot vert', 'basilic', 'persil',
    'coriandre', 'menthe', 'ciboulette', 'aneth', 'gingembre', 'citron', 'orange', 'clementine', 'mandarine', 'pamplemousse',
    'pomme', 'poire', 'banane', 'fraise', 'framboise', 'myrtille', 'cerise', 'peche', 'abricot', 'nectarine', 'ananas', 'mangue',
    'raisin', 'kiwi', 'melon', 'pasteque', 'fruit', 'legume', 'prune', 'figue', 'grenade', 'litchi'], 'fruits_legumes'],
  [['poulet', 'dinde', 'volaille', 'canard', 'boeuf', 'veau', 'porc', 'agneau', 'viande', 'steak', 'hache', 'escalope', 'jambon',
    'lardon', 'bacon', 'saucisse', 'merguez', 'chipolata', 'chorizo', 'saucisson', 'saumon', 'thon frais', 'cabillaud', 'poisson',
    'colin', 'merlu', 'truite', 'crevette', 'gambas', 'moule', 'huitre', 'calamar', 'dorade', 'filet', 'roti', 'cote'], 'boucherie_poissonnerie'],
  [['lait', 'beurre', 'creme', 'yaourt', 'yogourt', 'fromage', 'parmesan', 'mozzarella', 'emmental', 'gruyere', 'comte', 'feta',
    'chevre', 'ricotta', 'mascarpone', 'skyr', 'faisselle', 'oeuf', 'margarine', 'petit suisse', 'dessert lacte', 'tofu'], 'cremerie_oeufs'],
  [['pain', 'baguette', 'brioche', 'croissant', 'viennoiserie', 'pain de mie', 'tortilla', 'wrap', 'pita', 'biscotte'], 'boulangerie'],
  [['sel', 'poivre', 'epice', 'cumin', 'paprika', 'curry', 'cannelle', 'muscade', 'moutarde', 'ketchup', 'mayonnaise', 'vinaigre',
    'sauce soja', 'harissa', 'pesto', 'herbes de provence', 'bouillon', 'cornichon', 'huile', 'vinaigrette'], 'condiments_epices'],
  [['sucre', 'chocolat', 'cacao', 'biscuit', 'gateau', 'confiture', 'miel', 'pate a tartiner', 'nutella', 'cereale', 'bonbon',
    'compote', 'vanille', 'levure', 'farine', 'madeleine', 'cookie', 'muesli', 'granola'], 'epicerie_sucree'],
  [['pate', 'spaghetti', 'penne', 'tagliatelle', 'fusilli', 'riz', 'semoule', 'quinoa', 'boulgour', 'lentille', 'pois chiche',
    'haricot', 'conserve', 'thon', 'sardine', 'mais', 'coulis', 'concentre', 'chips', 'cracker', 'olive', 'soupe', 'nouille', 'flocon'], 'epicerie_salee'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const AISLE_COMPILED: [RegExp, Aisle][] = AISLE_RULES.map(([keys, aisle]) => [
  // Les expressions longues d'abord : « pomme de terre » avant « pomme », « thon frais » avant « thon ».
  new RegExp(`(^|[\\s'-])(${[...keys].sort((a, b) => b.length - a.length).map((k) => escape(normalizeText(k))).join('|')})(s|x)?(?=$|[\\s'-])`),
  aisle,
]);

/**
 * Rayon d'un article : celui déjà connu de l'appli (habituels, stock, ingrédients des recettes),
 * sinon deviné par mots-clés, sinon « autre ».
 */
export function guessAisle(name: string, known: { recent?: RecentItem[]; stock?: StockItem[]; recipes?: Recipe[] } = {}): Aisle {
  const n = normalizeText(name.trim());
  if (!n) return 'autre';
  const hit = known.recent?.find((r) => normalizeText(r.name) === n)?.aisle
    ?? known.stock?.find((s) => normalizeText(s.name) === n)?.aisle
    ?? known.recipes?.flatMap((r) => r.ingredients).find((i) => normalizeText(i.name) === n)?.aisle;
  if (hit) return hit;
  for (const [re, aisle] of AISLE_COMPILED) if (re.test(n)) return aisle;
  return 'autre';
}

/** Suggestion affichée pendant la saisie. */
export interface Suggestion {
  name: string;
  aisle: Aisle;
  source: 'habituel' | 'stock' | 'recette' | 'garde-manger';
}

/**
 * Noms connus qui correspondent à la saisie (début de mot d'abord), sans doublon, sans ce qui est déjà dans la liste.
 */
export function suggestItems(
  query: string,
  sources: { recent: RecentItem[]; stock: StockItem[]; recipes: Recipe[]; pantry: PantryItem[]; inList: string[] },
  max = 6,
): Suggestion[] {
  const q = normalizeText(query.trim());
  if (q.length < 2) return [];
  const taken = new Set(sources.inList.map((n) => normalizeText(n)));
  const seen = new Set<string>();
  const all: Suggestion[] = [];
  const add = (name: string, aisle: Aisle, source: Suggestion['source']) => {
    const n = name.trim().toLowerCase();
    const k = normalizeText(n);
    if (!k || seen.has(k) || taken.has(k)) return;
    seen.add(k);
    all.push({ name: n, aisle, source });
  };
  sortRecent(sources.recent).forEach((r) => add(r.name, r.aisle, 'habituel'));
  sources.stock.forEach((s) => add(s.name, s.aisle, 'stock'));
  sources.recipes.forEach((r) => r.ingredients.forEach((i) => add(i.name, i.aisle, 'recette')));
  sources.pantry.forEach((p) => add(p.name, guessAisle(p.name), 'garde-manger'));

  const score = (s: Suggestion): number => {
    const k = normalizeText(s.name);
    if (k === q) return -1;
    if (k.startsWith(q)) return 0;
    if (k.split(/[\s'-]+/).some((w) => w.startsWith(q))) return 1;
    return k.includes(q) ? 2 : 9;
  };
  return all
    .map((s, i) => ({ s, i, sc: score(s) }))
    .filter((x) => x.sc < 9 && x.sc >= 0)
    .sort((a, b) => a.sc - b.sc || a.i - b.i)
    .slice(0, max)
    .map((x) => x.s);
}

/** Habituels triés : les plus fréquents, puis les plus récents. */
export function sortRecent(recent: RecentItem[]): RecentItem[] {
  return [...recent].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

/** Retient un article ajouté à la main dans les habituels (cumule le compteur, garde la dernière quantité et le dernier rayon). */
export function rememberItem(recent: RecentItem[], item: Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'aisle'>, now: number): RecentItem[] {
  const k = normalizeText(item.name);
  const prev = recent.find((r) => normalizeText(r.name) === k);
  const next: RecentItem = {
    name: item.name, quantity: item.quantity, unit: item.unit, aisle: item.aisle,
    count: (prev?.count ?? 0) + 1, lastAt: now,
  };
  const rest = recent.filter((r) => normalizeText(r.name) !== k);
  // Au-delà du maximum, on oublie les moins utiles (rares et anciens).
  return sortRecent([next, ...rest]).slice(0, RECENT_MAX);
}

/** Oublie un habituel. */
export function forgetItem(recent: RecentItem[], name: string): RecentItem[] {
  const k = normalizeText(name);
  return recent.filter((r) => normalizeText(r.name) !== k);
}

/**
 * Ajoute un article manuel à la liste. S'il y est déjà (même nom, même famille d'unité, pas encore coché),
 * les quantités se cumulent au lieu de créer un doublon. Renvoie aussi l'identifiant de la ligne touchée.
 */
export function addManualItem(
  state: ShoppingState,
  item: { name: string; quantity: number | null; unit: Unit; aisle: Aisle },
  makeId: () => string,
): { state: ShoppingState; id: string; merged: boolean } {
  const name = item.name.trim().toLowerCase();
  const unit = item.quantity === null ? null : item.unit;
  const family = unitFamily(unit, item.quantity);
  const k = normalizeText(name);
  const checked = new Set(state.checkedKeys);
  const same = state.manualItems.find(
    (m) => normalizeText(m.name) === k && !checked.has(`manuel:${m.id}`) && sameFamily(m, family),
  );
  if (same) {
    const quantity = same.quantity === null || item.quantity === null ? same.quantity ?? item.quantity : addSame(same, item.quantity, unit);
    const tidy = bigUnit(round(quantity), same.quantity === null ? unit : same.unit);
    const manualItems = state.manualItems.map((m) => (m.id === same.id ? { ...m, ...tidy } : m));
    return { state: { ...state, manualItems }, id: same.id, merged: true };
  }
  const id = makeId();
  const created: ShoppingItem = { id, name, quantity: item.quantity, unit, aisle: item.aisle, checked: false, origin: 'manual', recipeIds: [] };
  return { state: { ...state, manualItems: [...state.manualItems, created] }, id, merged: false };
}

const BASE: Partial<Record<Exclude<Unit, null>, number>> = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };

function sameFamily(m: ShoppingItem, family: ReturnType<typeof unitFamily>): boolean {
  const f = unitFamily(m.unit, m.quantity);
  // Un article sans quantité se fond avec n'importe quelle quantité du même produit.
  return f === family || f === 'sans_quantite' || family === 'sans_quantite';
}

/** Cumule une quantité dans l'unité de l'article existant (500 g + 1 kg = 1500 g). */
function addSame(m: ShoppingItem, quantity: number, unit: Unit): number {
  const from = unit ? BASE[unit] : undefined;
  const to = m.unit ? BASE[m.unit] : undefined;
  if (from && to) return (m.quantity ?? 0) + (quantity * from) / to;
  return (m.quantity ?? 0) + quantity;
}

/** 1500 g → 1,5 kg ; 1200 ml → 1,2 l (après un cumul). */
function bigUnit(quantity: number | null, unit: Unit): { quantity: number | null; unit: Unit } {
  if (quantity !== null && quantity >= 1000 && (unit === 'g' || unit === 'ml')) return { quantity: round(quantity / 1000), unit: unit === 'g' ? 'kg' : 'l' };
  return { quantity, unit };
}

const round = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

/** Modifie un article manuel (nom, quantité, unité, rayon). */
export function editManualItem(
  state: ShoppingState,
  id: string,
  edit: { name: string; quantity: number | null; unit: Unit; aisle: Aisle },
): ShoppingState {
  const name = edit.name.trim().toLowerCase();
  if (!name) return state;
  return {
    ...state,
    manualItems: state.manualItems.map((m) =>
      m.id === id ? { ...m, name, quantity: edit.quantity, unit: edit.quantity === null ? null : edit.unit, aisle: edit.aisle } : m,
    ),
  };
}

/** Retire un article manuel (et son état coché). */
export function removeManualItem(state: ShoppingState, id: string): ShoppingState {
  const key = `manuel:${id}`;
  return {
    ...state,
    manualItems: state.manualItems.filter((m) => m.id !== id),
    checkedKeys: state.checkedKeys.filter((k) => k !== key),
    stocked: state.stocked.filter((e) => e.key !== key),
  };
}
