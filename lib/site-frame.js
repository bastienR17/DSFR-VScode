'use strict';
/**
 * Mise en page « comme le site » : l'aperçu entoure le contenu de la page du même cadre que le thème
 * mkdocs-dsfr 0.27 (gabarits base.html, header.html, lateral.html, footer.html) :
 *
 *   en-tête (bloc-marque, titre et sous-titre du site, bouton « Éditer »)
 *   <main>
 *     bandeau d'information (notice)
 *     conteneur → ligne de grille → menu latéral (col. 3/12) + contenu (col. 9/12)
 *                                   fil d'Ariane, sommaire, contenu de la page
 *   lettre d'information, pied de page
 *
 * Le menu latéral est, comme sur le site, la table des matières de la page : titres de premier
 * niveau, leurs sous-titres, et les sous-sous-titres dans un sous-menu repliable. Comme la table des
 * matières de MkDocs, il compte aussi les titres produits par les composants (titre d'alerte, d'accordéon…).
 *
 * Module pur : il reçoit le HTML déjà rendu et les réglages du site (lus dans mkdocs.yml ou dans les
 * réglages de l'extension), et renvoie le HTML complet. Testé par test/site-frame.js.
 */
const { esc } = require('./html');

/**
 * @typedef {object} SiteConfig
 * @property {string} intitule        bloc-marque (« République<br>française ») : seules les balises <br> sont gardées
 * @property {string} titre           titre du site dans l'en-tête
 * @property {string} sousTitre       sous-titre (tagline) : balises <br>, <i> et <em> gardées
 * @property {{name: string, url: string, icon?: string, external?: boolean}[]} headerLinks
 * @property {boolean} search         barre de recherche dans l'en-tête
 * @property {string[]} nav           rubriques du menu principal (sous l'en-tête)
 * @property {string} path            chemin de la page : la rubrique qui y figure est mise en évidence
 * @property {boolean} editButton     bouton « Éditer » dans l'en-tête
 * @property {string} editLabel
 * @property {boolean} lateral        menu latéral (afficher_menu_lateral, ou « sidemenu: » dans l'en-tête de la page)
 * @property {string} footerDescription
 * @property {{name: string, url: string}[]} footerLinks
 * @property {{name: string, url: string, icon?: string}[]} bottomLinks
 * @property {string} backtop        « left », « right » ou « » (bouton_hautdepage)
 * @property {boolean} desktop        largeur d'un écran d'ordinateur, réduite pour tenir dans l'aperçu
 */

const DEFAULT_FOOTER_LINKS = [
  { name: 'info.gouv.fr', url: 'https://www.info.gouv.fr/' },
  { name: 'service-public.fr', url: 'https://www.service-public.fr/' },
  { name: 'legifrance.gouv.fr', url: 'https://www.legifrance.gouv.fr/' },
  { name: 'data.gouv.fr', url: 'https://www.data.gouv.fr/' },
];

/**
 * Doc SIRH : en-tête, menu et pied de page du site (relevés sur le site en octobre 2026). Utilisés quand
 * le mkdocs.yml du site n'est pas dans le dossier ouvert ; bloc-marque, titre et sous-titre restent réglables.
 */
const DOC_SIRH = {
  intitule: 'Ministères<br>Transition écologique<br>Aménagement du territoire<br>Transports<br>Ville et logement',
  titre: 'Doc SIRH',
  sousTitre: 'Portail de documentation et d\'accompagnement SIRH<br><i>Applications RH : Processus dématérialisés, Habilitation, Assistance, Formation SIRH</i>',
  headerLinks: [
    { name: 'Assistance Doc SIRH', url: '#', external: true },
    { name: 'Je donne mon avis', url: '#' },
  ],
  editButton: true,
  editLabel: 'Éditer',
  search: true,
  nav: ['Accueil', 'Prise en main du SIRH', 'RH proximité', 'GA PAYE', 'Formation', 'Valorisation des données', 'Social', 'Assistance - Divers'],
  footerDescription: 'Ce site est édité par la Direction des Ressources Humaines',
  footerLinks: [
    { name: 'Intranet de la DRH', url: '#' },
    { name: 'Portail Intranet du CISIRH - RenoiRH', url: '#' },
  ],
  bottomLinks: [
    { name: 'Accessibilité : non conforme', url: '#' }, { name: 'Mentions légales', url: '#' }, { name: 'Favoris', url: '#' },
    { name: 'Liens utiles', url: '#' }, { name: 'Index du site', url: '#' }, { name: 'Webmestre-DSNUMRH', url: '#' },
  ],
};

/** Réglages du thème par défaut (mkdocs_theme.yml), complétés par `overrides`. */
function siteDefaults(overrides) {
  return Object.assign({
    intitule: 'République <br> française',
    titre: 'Titre',
    sousTitre: 'Sous-titre',
    headerLinks: [],
    search: true,
    nav: [],
    path: '',
    editButton: true,
    editLabel: 'Éditer dans Gitlab Forge',
    lateral: true,
    footerDescription: '',
    footerLinks: DEFAULT_FOOTER_LINKS,
    bottomLinks: [],
    backtop: 'left',
    desktop: false,
  }, overrides || {});
}

// Bloc-marque : texte échappé, retours à la ligne <br> conservés (comme dans le mkdocs.yml du thème)
const brand = (s) => esc(String(s || '')).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
const tagline = (s) => brand(s).replace(/&lt;(\/?)(i|em)&gt;/gi, '<$1$2>');
// Rubrique et dossier comparés sans accents, casse ni ponctuation (« RH proximité » = « RH-proximite »)
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const plain = (html) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * Titres du contenu rendu, numérotés (attribut data-dsfr-toc) pour les liens du menu latéral.
 * @returns {{html: string, headings: {level: number, title: string, ref: string}[]}}
 */
function numberHeadings(html) {
  const headings = [];
  const out = html.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (m, level, attrs, inner) => {
    const ref = String(headings.length);
    headings.push({ level: Number(level), title: plain(inner), ref });
    return '<h' + level + ' data-dsfr-toc="' + ref + '"' + (attrs || '') + '>' + inner + '</h' + level + '>';
  });
  return { html: out, headings };
}

// Arbre des titres, comme la table des matières de MkDocs
function tocTree(headings) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const h of headings) {
    const node = Object.assign({ children: [] }, h);
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

/** Menu latéral (lateral.html) : table des matières de la page. Vide si la page n'a pas de titre. */
function lateralHtml(headings) {
  const toc = tocTree(headings);
  if (!toc.length) return '';
  const link = (n) => '<li class="fr-sidemenu__item"><a class="fr-sidemenu__link" href="#" target="_self" data-dsfr-toc-goto="' + esc(n.ref) + '">' + esc(n.title) + '</a></li>\n';
  let sub = 0;
  let out = '<div class="fr-col-12 fr-col-md-3 fr-py-1v">\n<nav class="fr-sidemenu fr-sidemenu--sticky-full-height fr-mb-0-5v" role="navigation" aria-label="Menu latéral">\n';
  toc.forEach((top, t) => {
    // Le thème donne le même id à chaque bloc ; ici, un id par bloc pour que chacun se replie seul.
    const wrapper = 'fr-sidemenu-wrapper' + (t ? '-' + (t + 1) : '');
    out += '<div class="fr-sidemenu__inner">\n<button class="fr-sidemenu__btn" aria-controls="' + wrapper + '" aria-expanded="true">' + esc(top.title) + '</button>\n' +
      '<div class="fr-collapse" id="' + wrapper + '">\n<div class="fr-sidemenu__title">' + esc(top.title) + '</div>\n<ul class="fr-sidemenu__list">\n';
    for (const item of top.children) {
      if (!item.children.length) { out += link(item); continue; }
      sub++;
      out += '<li class="fr-sidemenu__item">\n<button class="fr-sidemenu__btn" aria-expanded="false" aria-controls="fr-sidemenu-item-' + sub + '">' + esc(item.title) + '</button>\n' +
        '<div class="fr-collapse" id="fr-sidemenu-item-' + sub + '">\n<ul class="fr-sidemenu__list">\n' + item.children.map(link).join('') + '</ul>\n</div>\n</li>\n';
    }
    out += '<li id="backtop_lateral" class="fr-sidemenu__item"></li>\n</ul>\n</div>\n</div>\n';
  });
  return out + '</nav>\n</div>\n';
}

/** Menu principal (nav.html) : rubriques du site, sans leurs sous-menus. */
function navHtml(site) {
  const items = site.nav || [];
  if (!items.length) return '';
  const folders = String(site.path || '').split(/[\\/]/).map(norm);
  const active = items.find((t) => norm(t) !== norm('Accueil') && folders.includes(norm(t)));
  return '<div class="fr-header__menu fr-modal">\n<div class="fr-container">\n<nav class="fr-nav navbar-header" role="navigation" aria-label="Menu principal">\n<ul class="fr-nav__list">\n' +
    items.map((t) => '<li class="fr-nav__item"><button class="fr-nav__btn" aria-expanded="false"' + (t === active ? ' aria-current="true"' : '') + '>' + esc(t) + '</button></li>\n').join('') +
    '</ul>\n</nav>\n</div>\n</div>\n';
}

/** En-tête (header.html) : bloc-marque, titre, liens, recherche et menu principal (sans leurs fenêtres). */
function headerHtml(site, url) {
  const ext = (l) => (l.external ? ' target="_blank" rel="noopener"' : '');
  const links = (site.headerLinks || []).map((l) => '<li><a href="' + esc(url(String(l.url || '#'))) + '"' + ext(l) + ' class="fr-btn' + (l.icon ? ' fr-icon-' + esc(l.icon) : '') + '">' + esc(l.name) + '</a></li>\n').join('') +
    (site.editButton ? '<li><a href="#" target="_blank" rel="noopener" class="fr-btn fr-icon-edit-line">' + esc(site.editLabel) + '</a></li>\n' : '');
  const search = site.search
    ? '<div class="fr-header__search fr-modal">\n<div class="fr-container fr-container-lg--fluid">\n<div class="fr-search-bar" role="search">\n' +
      '<label class="fr-label">Rechercher</label>\n<input class="fr-input" placeholder="Rechercher" type="search">\n<button class="fr-btn" title="Rechercher" type="button">Rechercher</button>\n</div>\n</div>\n</div>\n'
    : '';
  return '<header role="banner" class="fr-header">\n<div class="fr-header__body">\n<div class="fr-container">\n<div class="fr-header__body-row">\n' +
    '<div class="fr-header__brand fr-enlarge-link">\n<div class="fr-header__brand-top">\n<div class="fr-header__logo">\n<p class="fr-logo">' + brand(site.intitule) + '</p>\n</div>\n' +
    '<div class="fr-header__navbar">\n<button class="fr-btn--search fr-btn" title="Rechercher">Rechercher</button>\n<button class="fr-btn--menu fr-btn" title="Menu">Menu</button>\n</div>\n</div>\n' +
    '<div class="fr-header__service">\n<a href="#" title="Retour à l\'accueil du site - ' + esc(site.titre) + '">\n<p class="fr-header__service-title">' + esc(site.titre) + '</p>\n</a>\n' +
    '<p class="fr-header__service-tagline">' + tagline(site.sousTitre) + '</p>\n</div>\n</div>\n' +
    '<div class="fr-header__tools">\n<div class="fr-header__tools-links">\n<ul class="fr-btns-group">\n' + links + '</ul>\n</div>\n' + search + '</div>\n' +
    '</div>\n</div>\n</div>\n' + navHtml(site) + '</header>\n';
}

/** Pied de page (footer.html). */
function footerHtml(site, url) {
  const links = (site.footerLinks || []).map((l) => '<li class="fr-footer__content-item"><a class="fr-footer__content-link" target="_blank" rel="noopener" href="' + esc(url(String(l.url || '#'))) + '">' + esc(l.name) + '</a></li>\n').join('');
  const bottom = (site.bottomLinks || []).map((l) => '<li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link' + (l.icon ? ' fr-icon-' + esc(l.icon) : '') + '" href="' + esc(url(String(l.url || '#'))) + '">' + esc(l.name) + '</a></li>\n').join('');
  return '<footer class="fr-footer" role="contentinfo" id="footer">\n<div class="fr-container">\n<div class="fr-footer__body">\n' +
    '<div class="fr-footer__brand fr-enlarge-link">\n<a href="#" title="Retour à l\'accueil du site">\n<p class="fr-logo">' + brand(site.intitule) + '</p>\n</a>\n</div>\n' +
    '<div class="fr-footer__content">\n<p class="fr-footer__content-desc">' + esc(site.footerDescription) + '</p>\n<ul class="fr-footer__content-list">\n' + links + '</ul>\n</div>\n</div>\n' +
    '<div class="fr-footer__bottom">\n<ul class="fr-footer__bottom-list">\n' + bottom +
    '<li class="fr-footer__bottom-item"><button class="fr-footer__bottom-link fr-fi-theme-fill fr-link--icon-left">Paramètres d\'affichage</button></li>\n</ul>\n' +
    '<div class="fr-footer__bottom-copy">\n<p>Sauf mention contraire, tous les contenus de ce site sont sous <a href="https://github.com/etalab/licence-ouverte/blob/master/LO.md" target="_blank">licence etalab-2.0</a></p>\n</div>\n' +
    '</div>\n</div>\n</footer>\n';
}

/**
 * Page complète.
 * @param {object} p
 * @param {string} p.content     HTML du contenu de la page
 * @param {{notice: string, breadcrumb: string|null, summary: string, newsletter: string, error: string}} p.parts
 *        morceaux issus de l'en-tête YAML (page-meta.js) ; breadcrumb est null si la page n'en déclare pas
 * @param {{sidemenu?: boolean}} p.meta   en-tête YAML de la page
 * @param {SiteConfig} p.site
 * @param {(u: string) => string} p.url  neutralise les adresses dangereuses
 */
function framePage(p) {
  const site = siteDefaults(p.site);
  const url = p.url || ((u) => u);
  const { html, headings } = numberHeadings(p.content);
  const meta = p.meta || {};
  const lateral = meta.sidemenu !== undefined ? !!meta.sidemenu && String(meta.sidemenu).toLowerCase() !== 'false' : site.lateral;
  const hasBreadcrumb = p.parts.breadcrumb !== null && p.parts.breadcrumb !== undefined;
  const col = 'fr-col-12 ' + (lateral ? 'fr-col-md-9' : 'fr-col-md-12') + (hasBreadcrumb ? '' : ' fr-py-6v');
  const backtop = site.backtop === 'left' ? '<div id="backtop" class="fr-grid-row"></div>\n'
    : site.backtop === 'right' ? '<div id="backtop" class="fr-grid-row fr-grid-row--right"></div>\n' : '';
  return '<div class="dsfr-site"' + (site.desktop ? ' data-desktop="true"' : '') + '>\n' +
    headerHtml(site, url) +
    '<main id="content" role="main">\n' + (p.parts.notice || '') +
    '<div class="fr-container markdown-content">\n<div class="fr-grid-row">\n' +
    (lateral ? lateralHtml(headings) : '') +
    '<div id="contenu" class="' + col + '">\n' + (p.parts.error || '') + (p.parts.breadcrumb || '') + (p.parts.summary || '') +
    html + backtop + '</div>\n<hr />\n</div>\n</div>\n</main>\n' +
    (p.parts.newsletter || '') + footerHtml(site, url) + '</div>\n';
}

module.exports = { framePage, siteDefaults, numberHeadings, lateralHtml, DEFAULT_FOOTER_LINKS, DOC_SIRH };
