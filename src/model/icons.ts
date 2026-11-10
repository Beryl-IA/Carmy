// Icône par ingrédient (V2-J2) : emoji Unicode choisi par mots-clés, sinon selon le rayon. Logique pure.
import { normalizeText } from './search';
import type { Aisle } from './types';

/**
 * Mots-clés (sans accents, au singulier) → emoji. L'ordre compte : le premier qui correspond gagne,
 * donc les expressions précises (« pomme de terre », « huile d'olive ») passent avant les mots seuls.
 */
const RULES: [string[], string][] = [
  [['bouillon', 'fond de volaille', 'fond de veau'], '🍲'],
  [['pomme de terre', 'patate douce', 'patate'], '🥔'],
  [["huile d'olive", 'olive'], '🫒'],
  [['huile'], '🫗'],
  [['noix de coco', 'lait de coco', 'creme de coco', 'coco'], '🥥'],
  [['lait'], '🥛'],
  [['creme', 'yaourt', 'fromage blanc', 'skyr', 'faisselle'], '🥛'],
  [['beurre de cacahuete', 'cacahuete', 'arachide'], '🥜'],
  [['beurre'], '🧈'],
  [['fromage', 'parmesan', 'mozzarella', 'emmental', 'gruyere', 'comte', 'feta', 'chevre', 'ricotta', 'mascarpone', 'cheddar', 'raclette', 'reblochon', 'burrata'], '🧀'],
  [['oeuf', 'jaune', 'blanc d\'oeuf'], '🥚'],
  [['poulet', 'dinde', 'volaille', 'canard', 'pilon', 'aiguillette'], '🍗'],
  [['lardon', 'bacon', 'pancetta'], '🥓'],
  [['jambon', 'chorizo', 'saucisse', 'saucisson', 'merguez', 'chipolata'], '🌭'],
  [['boeuf', 'veau', 'porc', 'agneau', 'viande', 'steak', 'hache', 'escalope', 'cote', 'filet mignon', 'roti'], '🥩'],
  [['crevette', 'gambas'], '🦐'],
  [['saumon', 'thon', 'cabillaud', 'poisson', 'colin', 'merlu', 'truite', 'sardine', 'maquereau', 'lieu', 'dorade', 'bar'], '🐟'],
  [['moule', 'huitre', 'calamar', 'seiche', 'poulpe', 'saint-jacques'], '🦑'],
  [['tofu', 'tempeh', 'seitan'], '🍢'],
  [['riz', 'risotto'], '🍚'],
  [['pate', 'spaghetti', 'penne', 'tagliatelle', 'fusilli', 'linguine', 'lasagne', 'macaroni', 'coquillette', 'nouille', 'vermicelle', 'gnocchi', 'orzo', 'ravioli'], '🍝'],
  [['pain', 'baguette', 'brioche', 'tortilla', 'wrap', 'pita', 'chapelure', 'biscotte', 'naan'], '🍞'],
  [['farine', 'maizena', 'fecule', 'levure', 'semoule', 'boulgour', 'quinoa', 'avoine', 'flocon', 'polenta', 'ble'], '🌾'],
  [['lentille', 'pois chiche', 'haricot rouge', 'haricot blanc', 'flageolet', 'feve', 'edamame', 'pois casse'], '🫘'],
  [['petit pois', 'pois gourmand', 'haricot vert', 'haricot'], '🫛'],
  [['tomate', 'coulis', 'concentre de tomate', 'passata'], '🍅'],
  [['oignon', 'echalote', 'cebette', 'oignon nouveau'], '🧅'],
  [['ail'], '🧄'],
  [['carotte', 'panais'], '🥕'],
  [['poivron', 'piment'], '🫑'],
  [['courgette', 'concombre', 'cornichon'], '🥒'],
  [['aubergine'], '🍆'],
  [['brocoli', 'chou-fleur', 'chou fleur', 'romanesco'], '🥦'],
  [['champignon', 'cepe', 'girolle', 'shiitake', 'pleurote'], '🍄'],
  [['mais'], '🌽'],
  [['avocat'], '🥑'],
  [['epinard', 'salade', 'laitue', 'roquette', 'mache', 'chou', 'blette', 'kale', 'poireau', 'endive', 'fenouil', 'celeri', 'asperge', 'artichaut', 'courge', 'potiron', 'butternut', 'potimarron', 'navet', 'radis', 'betterave'], '🥬'],
  [['basilic', 'persil', 'coriandre', 'menthe', 'ciboulette', 'aneth', 'thym', 'romarin', 'laurier', 'estragon', 'sauge', 'origan', 'herbe', 'bouquet garni'], '🌿'],
  [['gingembre', 'curcuma'], '🫚'],
  [['citron', 'citron vert', 'lime'], '🍋'],
  [['orange', 'clementine', 'mandarine', 'pamplemousse'], '🍊'],
  [['pomme', 'compote'], '🍎'],
  [['poire'], '🍐'],
  [['banane'], '🍌'],
  [['fraise'], '🍓'],
  [['framboise', 'myrtille', 'mure', 'cassis', 'fruits rouges', 'groseille'], '🫐'],
  [['cerise'], '🍒'],
  [['peche', 'abricot', 'nectarine'], '🍑'],
  [['ananas'], '🍍'],
  [['mangue'], '🥭'],
  [['raisin'], '🍇'],
  [['kiwi'], '🥝'],
  [['melon', 'pasteque'], '🍈'],
  [['amande', 'noisette', 'noix', 'pistache', 'cajou', 'pecan', 'graine', 'sesame', 'chia', 'lin', 'pignon'], '🌰'],
  [['chocolat', 'cacao', 'pepite'], '🍫'],
  [['miel', 'sirop d\'erable', 'sirop d\'agave', 'sirop'], '🍯'],
  [['sucre', 'cassonade', 'vergeoise', 'vanille', 'confiture'], '🍬'],
  [['sel', 'fleur de sel', 'poivre', 'epice', 'cumin', 'paprika', 'curry', 'cannelle', 'muscade', 'piment d\'espelette', 'ras el hanout', 'garam masala', 'herbes de provence'], '🧂'],
  [['sauce soja', 'soja', 'vinaigre', 'moutarde', 'ketchup', 'mayonnaise', 'pesto', 'sauce', 'nuoc-mam', 'tahini', 'harissa'], '🥫'],
  [['vin', 'biere', 'cidre', 'rhum', 'cognac', 'porto'], '🍷'],
  [['eau'], '💧'],
  [['cafe', 'the'], '☕'],
  [['glace', 'glacon'], '🧊'],
];

const AISLE_ICONS: Record<Aisle, string> = {
  fruits_legumes: '🥬', boucherie_poissonnerie: '🥩', cremerie_oeufs: '🥛', boulangerie: '🍞', epicerie_salee: '🥫',
  epicerie_sucree: '🍪', surgeles: '🧊', boissons: '🧃', condiments_epices: '🧂', autre: '🥄',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Un mot-clé correspond à un mot entier du nom, au singulier ou au pluriel (« oignons », « noix »). */
const COMPILED: [RegExp, string][] = RULES.map(([keys, icon]) => [
  new RegExp(`(^|[\\s'-])(${keys.map((k) => escape(normalizeText(k))).join('|')})(s|x)?(?=$|[\\s'-])`),
  icon,
]);

export function ingredientIcon(name: string, aisle: Aisle): string {
  const n = normalizeText(name);
  for (const [re, icon] of COMPILED) if (re.test(n)) return icon;
  return AISLE_ICONS[aisle];
}
