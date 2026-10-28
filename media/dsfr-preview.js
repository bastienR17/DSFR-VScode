/*
 * Script injecté dans l'aperçu Markdown de VS Code ("markdown.previewScripts").
 *
 * - active ou désactive les feuilles de style DSFR selon le marqueur posé par le plugin
 *   (<div id="dsfr-preview-state" data-enabled="…" data-theme="…">) ;
 * - aligne le thème DSFR (clair/sombre) sur celui de VS Code ;
 * - rend cliquables les accordéons, le fil d'Ariane, les onglets et le sommaire :
 *   le JavaScript officiel du DSFR n'est pas chargé, ce script en reproduit le minimum ;
 * - conserve l'état ouvert/fermé quand l'aperçu se rafraîchit pendant la saisie, page par page :
 *   l'aperçu suit le fichier Markdown actif, et chaque page retrouve ses accordéons et ses onglets.
 *
 * Attention : VS Code charge ce script en « async » et insère le contenu de la page APRÈS
 * coup, puis le remplace à chaque modification du fichier. Le script surveille donc le
 * contenu au lieu de supposer qu'il est déjà présent.
 *
 * Écrit en ES5 sans dépendance : il s'exécute tel quel dans la webview de l'aperçu.
 */
(function () {
  'use strict';

  // Feuilles de style ajoutées par l'extension (voir "markdown.previewStyles" dans package.json).
  // On les reconnaît à la fin de leur chemin, quel que soit le dossier d'installation.
  var DSFR_SHEETS = [
    '/media/dsfr/dsfr.min.css',
    '/media/dsfr/utility/utility.min.css',
    '/media/dsfr/css/theme.css',
    '/media/dsfr-preview.css'
  ];
  var COLLAPSE_BTN = 'button[aria-controls]';
  var STORAGE_PREFIX = 'dsfr-preview:';

  /* --- État par page -----------------------------------------------------
   * L'aperçu de VS Code suit le fichier Markdown actif : quand on change de fichier, il recharge
   * toute la page (et ce script). L'état des accordéons et des onglets est donc rangé par fichier
   * dans sessionStorage, propre à l'onglet d'aperçu, pour le retrouver en revenant sur la page.
   * Sans sessionStorage (navigation privée, test…), l'état reste en mémoire.
   */
  var pages = {};
  var current = null;

  // Adresse du fichier affiché, lue dans les données que VS Code place dans l'aperçu.
  function pageKey() {
    var meta = document.getElementById('vscode-markdown-preview-data');
    if (!meta) return '';
    try {
      return JSON.parse(meta.getAttribute('data-settings') || '{}').source || '';
    } catch (e) {
      return '';
    }
  }

  function loadPage(key) {
    if (pages[key]) return pages[key];
    var page = { key: key, open: new Set(), source: new Set(), tabs: new Map(), initialised: false };
    try {
      var saved = key && JSON.parse(window.sessionStorage.getItem(STORAGE_PREFIX + key) || 'null');
      if (saved) {
        page.open = new Set(saved.open || []);
        page.source = new Set(saved.source || []);
        page.tabs = new Map(saved.tabs || []);
        page.initialised = true;
      }
    } catch (e) { /* stockage indisponible : état en mémoire seulement */ }
    pages[key] = page;
    return page;
  }

  function savePage(page) {
    if (!page.key) return;
    try {
      window.sessionStorage.setItem(STORAGE_PREFIX + page.key, JSON.stringify({
        open: Array.from(page.open),
        source: Array.from(page.source),
        tabs: Array.from(page.tabs),
      }));
    } catch (e) { /* stockage indisponible ou plein : sans conséquence */ }
  }

  function currentPage() {
    var key = pageKey();
    if (!current || current.key !== key) current = loadPage(key);
    return current;
  }

  function marker() {
    return document.getElementById('dsfr-preview-state');
  }

  function isDsfrSheet(link) {
    var href = (link.getAttribute('href') || '').split(/[?#]/)[0];
    for (var i = 0; i < DSFR_SHEETS.length; i++) {
      var suffix = DSFR_SHEETS[i];
      if (href.length >= suffix.length && href.slice(-suffix.length) === suffix) return true;
    }
    return false;
  }

  function vscodeIsDark() {
    var b = document.body.classList;
    return b.contains('vscode-dark') || (b.contains('vscode-high-contrast') && !b.contains('vscode-high-contrast-light'));
  }

  // Renvoie true/false selon le marqueur, ou null si le contenu n'est pas encore là (on ne touche alors à rien).
  // Les attributs ne sont modifiés que s'ils changent : sinon le MutationObserver bouclerait.
  function applyState() {
    var m = marker();
    if (!m) return null;
    var enabled = m.getAttribute('data-enabled') !== 'false';
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (isDsfrSheet(links[i]) && links[i].disabled !== !enabled) links[i].disabled = !enabled;
    }
    var root = document.documentElement;
    var body = document.body;
    if (!enabled) {
      if (root.hasAttribute('data-fr-theme')) root.removeAttribute('data-fr-theme');
      if (root.hasAttribute('data-fr-scheme')) root.removeAttribute('data-fr-scheme');
      if (body.classList.contains('dsfr-preview')) body.classList.remove('dsfr-preview');
      return false;
    }
    var pref = m.getAttribute('data-theme') || 'auto';
    var theme = pref === 'dark' || (pref === 'auto' && vscodeIsDark()) ? 'dark' : 'light';
    if (root.getAttribute('data-fr-theme') !== theme) root.setAttribute('data-fr-theme', theme);
    if (root.getAttribute('data-fr-scheme') !== theme) root.setAttribute('data-fr-scheme', theme);
    if (!body.classList.contains('dsfr-preview')) body.classList.add('dsfr-preview');
    return true;
  }

  /* --- Blocs repliables : accordéons, fil d'Ariane… --------------------- */
  function collapseTarget(btn) {
    var id = btn.getAttribute('aria-controls');
    var target = id ? document.getElementById(id) : null;
    return target && target.classList.contains('fr-collapse') ? target : null;
  }

  function collapseButtons() {
    return Array.prototype.filter.call(document.querySelectorAll(COLLAPSE_BTN), collapseTarget);
  }

  // Clé stable d'un bloc repliable d'un rendu à l'autre : sa position et son libellé.
  function collapseKey(btn, index) {
    return index + '|' + (btn.textContent || '').trim();
  }

  function setCollapse(btn, expanded) {
    var value = expanded ? 'true' : 'false';
    if (btn.getAttribute('aria-expanded') !== value) btn.setAttribute('aria-expanded', value);
    var target = collapseTarget(btn);
    if (target && target.classList.contains('fr-collapse--expanded') !== expanded) {
      target.classList.toggle('fr-collapse--expanded', expanded);
    }
  }

  /* --- Onglets ---------------------------------------------------------- */
  function tabsOf(group) {
    var list = group.querySelector(':scope > .fr-tabs__list');
    return list ? Array.prototype.slice.call(list.querySelectorAll(':scope > li > .fr-tabs__tab')) : [];
  }

  // Clé stable d'un groupe d'onglets d'un rendu à l'autre.
  function tabKey(group) {
    return Array.prototype.indexOf.call(document.querySelectorAll('.fr-tabs'), group) + '|' + group.id;
  }

  function selectTab(group, index) {
    var tabs = tabsOf(group);
    if (!tabs[index]) return;
    tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.setAttribute('tabindex', on ? '0' : '-1');
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.classList.toggle('fr-tabs__panel--selected', on);
    });
  }

  /* --- Synchronisation après chaque (ré)insertion du contenu ------------- */
  function sync() {
    var state = applyState();
    if (state !== true) return;
    var page = currentPage();
    var seen = new Set();
    var buttons = collapseButtons();
    for (var i = 0; i < buttons.length; i++) {
      var key = collapseKey(buttons[i], i);
      var openInSource = buttons[i].getAttribute('aria-expanded') === 'true';
      // Ce qui est ouvert d'origine (accordéon « open: true ») est ouvert au premier affichage,
      // et de nouveau si l'option change dans le Markdown. Sinon, l'état choisi au clic l'emporte.
      if (!page.initialised || openInSource !== page.source.has(key)) {
        if (openInSource) page.open.add(key); else page.open.delete(key);
      }
      if (openInSource) seen.add(key);
      setCollapse(buttons[i], page.open.has(key));
    }
    var groups = document.querySelectorAll('.fr-tabs');
    for (var g = 0; g < groups.length; g++) {
      var wanted = page.tabs.get(tabKey(groups[g]));
      if (wanted !== undefined) selectTab(groups[g], wanted);
    }
    page.source = seen;
    page.initialised = true;
    savePage(page);
  }

  var scheduled = false;
  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      scheduled = false;
      sync();
    });
  }

  // Ouvre l'accordéon fermé qui contient l'élément d'identifiant `id` (s'il y en a un).
  function openAccordionAround(id) {
    if (!id) return;
    var el = null;
    try { el = document.getElementById(decodeURIComponent(id)); } catch (e) { return; }
    var accordion = el && el.closest ? el.closest('.fr-accordion') : null;
    if (!accordion) return;
    var button = accordion.querySelector('.fr-accordion__btn');
    if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
  }

  /* --- Clics et clavier -------------------------------------------------- */
  // Écoute en phase de capture : VS Code intercepte les clics sur les liens de l'aperçu.
  document.addEventListener('click', function (event) {
    if (!document.body.classList.contains('dsfr-preview')) return;
    var target = event.target;
    if (!target || !target.closest) return;

    // Sommaire : défilement vers le titre correspondant de l'aperçu
    var go = target.closest('[data-dsfr-goto]');
    if (go) {
      event.preventDefault();
      event.stopPropagation();
      var heading = document.querySelector('[data-dsfr-heading="' + go.getAttribute('data-dsfr-goto') + '"]');
      if (heading) heading.scrollIntoView({ block: 'start' });
      return;
    }

    // Lien vers une ancre de la page placée dans un accordéon fermé : l'accordéon s'ouvre d'abord,
    // comme sur le site (thème mkdocs-dsfr 0.27) ; VS Code fait ensuite défiler jusqu'à l'ancre.
    var anchor = target.closest('a[href^="#"]');
    if (anchor) openAccordionAround(anchor.getAttribute('href').slice(1));

    var btn = target.closest(COLLAPSE_BTN);
    if (btn && collapseTarget(btn)) {
      event.preventDefault();
      event.stopPropagation();
      var page = currentPage();
      var all = collapseButtons();
      var key = collapseKey(btn, all.indexOf(btn));
      var expanded = btn.getAttribute('aria-expanded') !== 'true';
      if (expanded) page.open.add(key); else page.open.delete(key);
      setCollapse(btn, expanded);
      savePage(page);
      return;
    }

    var tab = target.closest('.fr-tabs__tab');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      var group = tab.closest('.fr-tabs');
      if (group) {
        var index = tabsOf(group).indexOf(tab);
        var page = currentPage();
        page.tabs.set(tabKey(group), index);
        selectTab(group, index);
        savePage(page);
      }
    }
  }, true);

  // Navigation clavier dans les onglets (flèches gauche et droite), comme le DSFR.
  document.addEventListener('keydown', function (event) {
    if (!document.body.classList.contains('dsfr-preview')) return;
    var tab = event.target && event.target.closest && event.target.closest('.fr-tabs__tab');
    if (!tab || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    var group = tab.closest('.fr-tabs');
    var tabs = tabsOf(group);
    var i = (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    var page = currentPage();
    page.tabs.set(tabKey(group), i);
    selectTab(group, i);
    savePage(page);
    tabs[i].focus();
    event.preventDefault();
  });

  /* --- Déclencheurs ------------------------------------------------------ */
  // 1) Contenu inséré ou remplacé par VS Code (premier affichage compris)
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === 'childList') { scheduleSync(); return; }
    }
    // 2) Changement de thème de VS Code (classes du body)
    applyState();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // 3) Événement envoyé par VS Code après chaque mise à jour
  window.addEventListener('vscode.markdown.updateContent', scheduleSync);
  // 4) Au cas où le contenu serait déjà là
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync);
  scheduleSync();
})();
