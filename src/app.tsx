import { useEffect, useState } from 'preact/hooks';
import { TabBar } from './components/TabBar';
import { loadDishes, loadPlanning, loadSettings, requestPersistence, saveSettings } from './db/db';
import type { Settings } from './model/types';
import { EMPTY_FILTER, type RecipeFilter } from './model/search';
import { AddPage } from './pages/AddPage';
import { SemainePage } from './pages/SemainePage';
import { weekBadge } from './model/planning';
import { BatchCookPage } from './pages/BatchCookPage';
import { BatchPage } from './pages/BatchPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { CookPage } from './pages/CookPage';
import { HelpPage } from './pages/HelpPage';
import { TimerDock, TimersProvider } from './timers/TimersContext';
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
  const [queueCount, setQueueCount] = useState(0);
  /** V2-J3/J4 : plats à manger vite, à décongeler, repas à confirmer (pastille de l'onglet Semaine), recalculé à chaque navigation. */
  const [urgent, setUrgent] = useState(0);
  const refreshUrgent = () => void Promise.all([loadDishes(), loadPlanning()]).then(([d, p]) => setUrgent(weekBadge(d, p, Date.now())), () => {});
  /** Après un import : toutes les données ont pu changer. */
  const reloadAll = () => {
    void loadSettings().then(setSettings);
    bump();
  };
  /** Filtres de la bibliothèque, conservés quand on ouvre une fiche puis revient. */
  const [filter, setFilter] = useState<RecipeFilter>(EMPTY_FILTER);

  useEffect(() => {
    loadSettings().then(setSettings, (e) => setLoadError(String(e)));
    void requestPersistence().then(setPersisted);
  }, []);

  useEffect(refreshUrgent, [route.name]);

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

  const cooking = route.name === 'cuisine' || route.name === 'batch-cuisine';
  return (
    <TimersProvider cooking={cooking}>
    <div class={`app ${cooking ? 'cooking' : ''}`}>
      {!cooking && <UpdateBanner />}
      {/* La page Ajouter reste montée pour ne pas perdre une extraction ou une relecture en cours. */}
      <div hidden={tab !== 'ajouter'}>
        <AddPage settings={settings} onSaved={bump} onQueueChange={setQueueCount} />
      </div>
      {route.name === 'recettes' && (
        <RecipesPage version={dataVersion} filter={filter} onFilter={setFilter} settings={settings} onSettings={setSettings} onSnooze={updateSettings} />
      )}
      {route.name === 'recette' && <RecipePage id={route.id} version={dataVersion} settings={settings} onChanged={bump} />}
      {route.name === 'modifier' && <EditPage id={route.id} onSaved={bump} />}
      {route.name === 'collections' && <CollectionsPage onChanged={bump} />}
      {route.name === 'courses' && <ShoppingPage defaultServings={settings.defaultServings} />}
      {route.name === 'reglages' && <SettingsPage settings={settings} onChange={updateSettings} persisted={persisted} onSettings={setSettings} onImported={reloadAll} />}
      {route.name === 'aide' && <HelpPage />}
      {route.name === 'cuisine' && (
        <CookPage key={route.id} id={route.id} step={route.step} servings={route.servings} defaultServings={settings.defaultServings} navToken={route} />
      )}
      {route.name === 'batch' && <BatchPage settings={settings} />}
      {route.name === 'semaine' && <SemainePage onChanged={refreshUrgent} />}
      {route.name === 'batch-cuisine' && <BatchCookPage step={route.step} navToken={route} />}
      {!cooking && <TimerDock />}
      {!cooking && <TabBar active={tab} badges={{ ajouter: queueCount, semaine: urgent }} />}
    </div>
    </TimersProvider>
  );
}
