// Navigation par ancre (#/recettes, #/recette/<id>…) : fonctionne hors-ligne et sous un sous-chemin GitHub Pages.
import { useEffect, useState } from 'preact/hooks';

export type Tab = 'recettes' | 'ajouter' | 'courses' | 'reglages';
export type Route =
  | { name: 'recettes' }
  | { name: 'recette'; id: string }
  | { name: 'modifier'; id: string }
  | { name: 'collections' }
  | { name: 'ajouter' }
  | { name: 'courses' }
  | { name: 'reglages' };

export function parseHash(hash: string): Route {
  const [, page = '', id = ''] = hash.replace(/^#/, '').split('/');
  switch (page) {
    case 'recette':
    case 'modifier':
      return id ? { name: page, id: decodeURIComponent(id) } : { name: 'recettes' };
    case 'collections':
    case 'ajouter':
    case 'courses':
    case 'reglages':
      return { name: page };
    default:
      return { name: 'recettes' };
  }
}

export function routeToHash(r: Route): string {
  return r.name === 'recette' || r.name === 'modifier' ? `#/${r.name}/${encodeURIComponent(r.id)}` : `#/${r.name}`;
}

export function tabOf(r: Route): Tab {
  return r.name === 'recette' || r.name === 'modifier' || r.name === 'collections' ? 'recettes' : r.name;
}

export function navigate(r: Route): void {
  const h = routeToHash(r);
  if (location.hash !== h) location.hash = h;
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
