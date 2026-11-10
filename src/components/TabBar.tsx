import type { JSX } from 'preact';
import type { Tab } from '../router';

const ICONS: Record<Tab, JSX.Element> = {
  recettes: (
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v15H6.5A1.5 1.5 0 0 0 5 19.5m0-15v15m0 0A1.5 1.5 0 0 0 6.5 21H18v-3M9 7h5" />
  ),
  ajouter: <path d="M12 5v14M5 12h14" />,
  courses: <path d="M4 5h2l2 10h9l2-7H7.2M10 19.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm7 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z" />,
  reglages: (
    <path d="M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4m-6 6v4" />
  ),
};

const LABELS: Record<Tab, string> = { recettes: 'Recettes', ajouter: 'Ajouter', courses: 'Courses', reglages: 'Réglages' };

export function TabBar({ active, badges = {} }: { active: Tab; badges?: Partial<Record<Tab, number>> }) {
  return (
    <nav class="tabbar" aria-label="Navigation principale">
      {(Object.keys(LABELS) as Tab[]).map((t) => (
        <a key={t} href={`#/${t}`} class={`tab ${t === active ? 'active' : ''} ${t === 'ajouter' ? 'tab-add' : ''}`} aria-current={t === active ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {ICONS[t]}
          </svg>
          <span>{LABELS[t]}</span>
          {badges[t] ? <span class="tab-badge" aria-label={`${badges[t]} en attente`}>{badges[t]}</span> : null}
        </a>
      ))}
    </nav>
  );
}
