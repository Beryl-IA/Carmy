// Navigation par ancre (#/recettes, #/recette/<id>…) : fonctionne hors-ligne et sous un sous-chemin GitHub Pages.
import { useEffect, useState } from 'preact/hooks';

export type Tab = 'recettes' | 'ajouter' | 'batch' | 'courses' | 'reglages';
export type Route =
  | { name: 'recettes' }
  | { name: 'recette'; id: string }
  | { name: 'modifier'; id: string }
  | { name: 'collections' }
  /** Mode cuisine : étape (à partir de 0) et portions facultatives. */
  | { name: 'cuisine'; id: string; step?: number; servings?: number }
  | { name: 'ajouter' }
  /** V2-J2b : session de batch cooking, et son mode cuisine (étape à partir de 0). */
  | { name: 'batch' }
  | { name: 'batch-cuisine'; step?: number }
  | { name: 'courses' }
  | { name: 'reglages' }
  | { name: 'aide' };

export function parseHash(hash: string): Route {
  const [, page = '', id = '', stepRaw = '', servingsRaw = ''] = hash.replace(/^#/, '').split('/');
  switch (page) {
    case 'cuisine': {
      if (!id) return { name: 'recettes' };
      const step = Number.parseInt(stepRaw, 10);
      const servings = Number.parseInt(servingsRaw, 10);
      return {
        name: 'cuisine',
        id: decodeURIComponent(id),
        ...(step >= 0 ? { step } : {}),
        ...(servings >= 1 ? { servings } : {}),
      };
    }
    case 'batch': {
      if (id !== 'cuisine') return { name: 'batch' };
      const step = Number.parseInt(stepRaw, 10);
      return { name: 'batch-cuisine', ...(step >= 0 ? { step } : {}) };
    }
    case 'recette':
    case 'modifier':
      return id ? { name: page, id: decodeURIComponent(id) } : { name: 'recettes' };
    case 'collections':
    case 'aide':
    case 'ajouter':
    case 'courses':
    case 'reglages':
      return { name: page };
    default:
      return { name: 'recettes' };
  }
}

export function routeToHash(r: Route): string {
  if (r.name === 'batch-cuisine') return `#/batch/cuisine${r.step !== undefined ? `/${r.step}` : ''}`;
  if (r.name === 'cuisine') {
    const tail = r.servings ? `/${r.step ?? 0}/${r.servings}` : r.step !== undefined ? `/${r.step}` : '';
    return `#/cuisine/${encodeURIComponent(r.id)}${tail}`;
  }
  return r.name === 'recette' || r.name === 'modifier' ? `#/${r.name}/${encodeURIComponent(r.id)}` : `#/${r.name}`;
}

export function tabOf(r: Route): Tab {
  if (r.name === 'aide') return 'reglages';
  if (r.name === 'batch-cuisine') return 'batch';
  return r.name === 'recette' || r.name === 'modifier' || r.name === 'collections' || r.name === 'cuisine' ? 'recettes' : r.name;
}

export function navigate(r: Route): void {
  const h = routeToHash(r);
  if (location.hash !== h) location.hash = h;
}

/** Met à jour l'adresse sans créer d'entrée d'historique ni déclencher de navigation. */
export function replaceRoute(r: Route): void {
  history.replaceState(history.state, '', routeToHash(r));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    // L'ancre a pu changer entre le premier rendu et l'abonnement.
    setRoute((r) => {
      const now = parseHash(location.hash);
      return routeToHash(now) === routeToHash(r) ? r : now;
    });
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
