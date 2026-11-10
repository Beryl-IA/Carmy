// Page d'aide (F9, J7) : installation, clé API, utilisation, limites d'iOS.
import { APP_NAME } from '../config';
import { isStandalone } from '../pwa/standalone';

export function HelpPage() {
  return (
    <main class="page stack help-page">
      <a class="back" href="#/reglages">‹ Réglages</a>
      <header class="page-header">
        <h1>Aide</h1>
      </header>

      <section class="card stack" id="installer">
        <h2>Installer sur l'écran d'accueil</h2>
        {isStandalone() ? (
          <p class="ok">✓ {APP_NAME} est installée : elle s'ouvre en plein écran et fonctionne hors-ligne.</p>
        ) : (
          <ol class="steps-help">
            <li>Ouvre cette page dans <strong>Safari</strong> (pas dans une autre appli).</li>
            <li>Touche <strong>Partager</strong> : le carré avec une flèche vers le haut.</li>
            <li>Fais défiler et choisis <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
            <li>Ouvre {APP_NAME} depuis sa nouvelle icône : tes recettes sont enregistrées dans cette version installée.</li>
          </ol>
        )}
      </section>

      <section class="card stack">
        <h2>Clé API pour l'extraction</h2>
        <ol class="steps-help">
          <li>Va sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> avec un compte Google.</li>
          <li>Touche <strong>Create API key</strong> et copie la clé.</li>
          <li>Dans Réglages › Réglages de l'IA : colle la clé, touche <strong>Tester la clé</strong>, choisis un modèle « flash-lite » puis <strong>Tester le modèle</strong>.</li>
        </ol>
        <ul class="small">
          <li>L'offre gratuite de l'API a un quota journalier. Un abonnement Gemini grand public ne s'applique pas à l'API.</li>
          <li>La clé reste sur cet iPhone et n'est jamais incluse dans les sauvegardes.</li>
          <li>Les vidéos et captures envoyées passent par Google : n'envoie que des recettes publiques, rien de personnel (vérifie qu'aucune notification ou message privé n'apparaît sur tes captures).</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Ajouter une recette</h2>
        <ul>
          <li><strong>Vidéo</strong> : enregistre d'abord le reel ou le TikTok dans Photos (bouton de téléchargement de l'appli d'origine), puis Ajouter › Vidéo. Colle le lien du post pour le retrouver plus tard.</li>
          <li><strong>Captures</strong> : choisis une ou plusieurs captures d'écran dans Photos (jusqu'à 10), par exemple les ingrédients sur l'une et les étapes sur les suivantes. Vérifie l'ordre avec ‹ et › : l'IA les lit dans cet ordre. Touche la capture qui servira de miniature (★).</li>
          <li><strong>Texte</strong> : copie la légende ou la description du post.</li>
          <li><strong>À la main</strong> : sans IA, fonctionne hors-ligne.</li>
          <li>Relis toujours la fiche avant d'enregistrer : l'IA peut se tromper sur une quantité.</li>
          <li>En cas d'échec (quota, réseau), la vidéo ou les captures restent dans <strong>En attente</strong> : touche Relancer plus tard.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Batch cooking</h2>
        <ul>
          <li>Onglet <strong>Batch</strong> : choisis 2 à 6 recettes et le nombre de portions de chacune.</li>
          <li><strong>🛒 Ajouter aux courses</strong> met toutes les recettes de la session dans ta liste, ingrédients fusionnés.</li>
          <li><strong>✨ Optimiser avec l'IA</strong> construit un déroulé unique : cuissons longues d'abord, découpes regroupées, préparations pendant que ça cuit. Chaque étape indique les recettes concernées (pastilles de couleur). Sans clé ou hors-ligne, le <strong>déroulé simple</strong> enchaîne les recettes l'une après l'autre.</li>
          <li><strong>Commencer la session</strong> ouvre le mode cuisine du déroulé (minuteurs, 🧺 ingrédients par recette). Tu peux quitter et reprendre où tu en étais.</li>
          <li>À la fin, <strong>Terminer</strong> affiche jusqu'à quand garder chaque plat au frigo et au congélateur.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Réserve</h2>
        <ul>
          <li><strong>Produits</strong> : en magasin, coche tes articles dans Courses, puis touche <strong>🧺 Ranger les courses</strong>. Corrige la quantité achetée si besoin (un paquet de 1 kg pour 300 g nécessaires) : tout part dans la réserve.</li>
          <li>Les courses tiennent compte de la réserve : ce que tu as déjà passe dans « Déjà à la maison », et seule la quantité manquante reste à acheter.</li>
          <li>Quand tu termines une recette ou une session, Carmy propose de <strong>déduire les ingrédients utilisés</strong> (300 g de riz : 1 kg → 700 g) et de <strong>ranger les portions</strong> au frigo ou au congélateur.</li>
          <li><strong>Plats</strong> : touche <strong>−1</strong> quand tu manges une portion, ❄️ pour congeler, 🧊 pour décongeler (à manger sous 24 h). La pastille de l'onglet Réserve compte les plats à manger aujourd'hui ou demain.</li>
          <li>Touche une quantité pour la corriger, ✕ quand un produit est terminé. Les basiques du garde-manger (sel, huile…) ne sont jamais décomptés.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Conservation et nutrition</h2>
        <ul>
          <li>Chaque fiche indique combien de temps garder le plat cuisiné au <strong>frigo</strong> et au <strong>congélateur</strong> (en boîte hermétique), et ses <strong>valeurs nutritionnelles pour 1 portion</strong>.</li>
          <li>Ce sont des <strong>estimations de l'IA</strong> : corrige-les avec « Modifier » si besoin. En cas de doute sur un plat, fie-toi à l'odeur et à l'aspect, et ne recongèle jamais un plat décongelé.</li>
          <li>Pour une recette enregistrée avant cette version : touche <strong>✨ Compléter avec l'IA</strong> sur sa fiche, ou complète-les toutes d'un coup dans Réglages › Conservation et nutrition.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>En cuisine</h2>
        <ul>
          <li>Glisse vers la gauche ou la droite pour changer d'étape ; 🧺 affiche les ingrédients.</li>
          <li>L'écran reste allumé tant que le mode cuisine est ouvert ou qu'un minuteur tourne.</li>
          <li><strong>Les minuteurs ne sonnent que si {APP_NAME} est ouverte</strong> : iOS ne permet pas d'alarme quand l'appli est fermée ou le téléphone verrouillé. Le décompte reste juste et l'alarme sonne à ton retour.</li>
          <li>L'alarme sonne même avec le bouton silencieux : règle le volume avec les boutons latéraux.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Courses</h2>
        <ul>
          <li>Ajoute des recettes depuis leur fiche (🛒) ou depuis l'onglet Courses, avec le nombre de portions voulu.</li>
          <li>Les ingrédients identiques sont regroupés ; poids, volumes et pièces ne sont jamais mélangés.</li>
          <li>Ce que tu as toujours à la maison (sel, huile…) se règle dans Réglages › Garde-manger.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Tes données</h2>
        <ul>
          <li>Tout est enregistré uniquement sur cet iPhone. Rien n'est envoyé ailleurs, sauf la vidéo, les captures ou le texte analysés par Google.</li>
          <li><strong>Exporte une sauvegarde régulièrement</strong> (Réglages › Sauvegarde) et range-la dans iCloud Drive : si l'appli est supprimée, tes recettes le sont aussi.</li>
          <li>Hors-ligne, tout fonctionne sauf l'extraction par IA.</li>
          <li>Quand une nouvelle version est publiée, un bandeau « Nouvelle version disponible » apparaît : touche Mettre à jour.</li>
        </ul>
      </section>
    </main>
  );
}
