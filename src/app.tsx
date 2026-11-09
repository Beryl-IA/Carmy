import { useEffect, useState } from 'preact/hooks';
import { TabBar } from './components/TabBar';
import { loadSettings, requestPersistence, saveSettings } from './db/db';
import type { Settings } from './model/types';
import { EMPTY_FILTER, type RecipeFilter } from './model/search';
import { AddPage } from './pages/AddPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { EditPage } from './pages/EditPage';
import { RecipePage } from './pages/RecipePage';
import { RecipesPage } from './pages/RecipesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { UpdateBanner } from './pwa/UpdateBanner';
import { tabOf, useRoute } from './router';

export function App() {
  const route = useRoute();
  const tab = tabOf(route);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  /** Incrémenté après chaque enregistrement pour rafraîchir la bibliothèque. */
  const [dataVersion, setDataVersion] = useState(0);
  const bump = () => setDataVersion((v) => v + 1);
  /** Filtres de la bibliothèque, conservés quand on ouvre une fiche puis revient. */
  const [filter, setFilter] = useState<RecipeFilter>(EMPTY_FILTER);

  useEffect(() => {
    loadSettings().then(setSettings, (e) => setLoadError(String(e)));
    void requestPersistence().then(setPersisted);
  }, []);

  function updateSettings(s: Settings) {
    setSettings(s);
    void saveSettings(s);
  }

  if (loadError)
    return (
      <div class="app">
        <p class="error">Impossible d'ouvrir le stockage local : {loadError}</p>
      </div>
    );
  if (!settings) return <div class="app loading" aria-busy="true" />;

  return (
    <div class="app">
      <UpdateBanner />
      {/* La page Ajouter reste montée pour ne pas perdre une extraction ou une relecture en cours. */}
      <div hidden={tab !== 'ajouter'}>
        <AddPage settings={settings} onSaved={bump} />
      </div>
      {route.name === 'recettes' && <RecipesPage version={dataVersion} filter={filter} onFilter={setFilter} />}
      {route.name === 'recette' && <RecipePage id={route.id} version={dataVersion} defaultServings={settings.defaultServings} onChanged={bump} />}
      {route.name === 'modifier' && <EditPage id={route.id} onSaved={bump} />}
      {route.name === 'collections' && <CollectionsPage onChanged={bump} />}
      {route.name === 'courses' && <ShoppingPage />}
      {route.name === 'reglages' && <SettingsPage settings={settings} onChange={updateSettings} persisted={persisted} />}
      <TabBar active={tab} />
    </div>
  );
}
