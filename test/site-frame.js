// Mise en page « comme le site » (lib/site-frame.js) : cadre du thème mkdocs-dsfr 0.27 autour du contenu
const assert = require('assert');
const createMd = require('./vscode-like.js');
const { framePage, numberHeadings } = require('../lib/site-frame');
const { parseConfig } = require('../lib/mkdocs-config');

const SITE = { titre: 'Doc SIRH', sousTitre: 'Modes opératoires', intitule: 'Ministère<br>de la Transition écologique' };
const render = (src, site, opts) => createMd(Object.assign({ showErrors: () => true, site: () => site }, opts || {})).render(src, {});
const page = '---\nbreadcrumb:\n  - Accueil: /\n  - Configurer\nnotice:\n  type: info\n  description: Bandeau\nsummary: true\n---\n\n' +
  '# Configurer\n\n/// accordion | Suivi des modifications\nTableau\n///\n\n## Partie A\n\n### Sous-partie A1\n\n## Partie B\n\nTexte\n';

let html = render(page, SITE);
const at = (s) => { const i = html.indexOf(s); assert(i >= 0, 'absent : ' + s + '\n' + html); return i; };
// Ordre du gabarit base.html : en-tête, main (bandeau, conteneur : menu latéral puis contenu), pied de page
assert(at('<div id="dsfr-preview-state"') < at('<div class="dsfr-site">'));
assert(at('<header role="banner" class="fr-header">') < at('<main id="content" role="main">'));
assert(at('<main id="content"') < at('fr-notice--info') && at('fr-notice--info') < at('<div class="fr-container markdown-content">'), 'bandeau hors du conteneur');
assert(at('fr-sidemenu') < at('<div id="contenu" class="fr-col-12 fr-col-md-9">'), 'menu latéral avant le contenu, colonne 9/12');
assert(at('<div id="contenu"') < at('fr-breadcrumb') && at('fr-breadcrumb') < at('fr-summary') && at('fr-summary') < at('<h1'), 'fil d\'Ariane, sommaire, puis contenu');
assert(at('</main>') < at('<footer class="fr-footer"'));
// En-tête et pied de page : textes du site, bloc-marque avec ses <br>
assert(html.includes('<p class="fr-header__service-title">Doc SIRH</p>') && html.includes('<p class="fr-header__service-tagline">Modes opératoires</p>'));
assert.strictEqual(html.split('<p class="fr-logo">Ministère<br>de la Transition écologique</p>').length, 3, 'bloc-marque dans l\'en-tête et le pied de page');
assert(html.includes('info.gouv.fr') && html.includes('licence etalab-2.0') && html.includes('Éditer dans Gitlab Forge'));
// Menu latéral = table des matières de la page, titres des composants compris (comme MkDocs)
const nav = html.slice(at('<nav class="fr-sidemenu'), at('</nav>'));
assert(nav.includes('<div class="fr-sidemenu__title">Configurer</div>'));
assert(/data-dsfr-toc-goto="\d+">Suivi des modifications</.test(nav), 'titre d\'accordéon dans le menu');
assert(/aria-controls="fr-sidemenu-item-1">Partie A<\/button>/.test(nav) && /data-dsfr-toc-goto="\d+">Sous-partie A1</.test(nav), 'sous-menu repliable');
assert(/data-dsfr-toc-goto="\d+">Partie B</.test(nav));
const goto = /data-dsfr-toc-goto="(\d+)">Sous-partie A1/.exec(nav)[1];
assert(new RegExp('<h3 data-dsfr-toc="' + goto + '"[^>]*>Sous-partie A1</h3>').test(html), 'le lien du menu vise le bon titre');

// Sans fil d'Ariane : marge haute du contenu (fr-py-6v) ; menu latéral coupé par la page ou le site
html = render('# Titre\n\nTexte\n', SITE);
assert(html.includes('<div id="contenu" class="fr-col-12 fr-col-md-9 fr-py-6v">'));
html = render('---\nsidemenu: false\n---\n\n# Titre\n', SITE);
assert(!html.includes('fr-sidemenu') && html.includes('fr-col-md-12 fr-py-6v'), 'sidemenu: false dans la page');
html = render('# Titre\n', Object.assign({ lateral: false }, SITE));
assert(!html.includes('fr-sidemenu') && html.includes('fr-col-md-12'), 'afficher_menu_lateral: false');
// Page sans titre : colonne 9/12 sans menu (comme le thème)
html = render('Texte seul\n', SITE);
assert(!html.includes('fr-sidemenu') && html.includes('fr-col-md-9'));
// Largeur d'ordinateur
assert(render('# T\n', Object.assign({ desktop: true }, SITE)).includes('<div class="dsfr-site" data-desktop="true">'));
// Échappement : seuls les <br> du bloc-marque passent
html = render('# T\n', { titre: '<img src=x onerror=alert(1)>', sousTitre: '"x"', intitule: 'A<br/>B<script>x</script>' });
assert(!html.includes('<img src=x') && !html.includes('<script>x') && html.includes('A<br>B&lt;script&gt;'));
// Mise en page « contenu » (site: null) ou rendu DSFR coupé : pas de cadre
assert(!render('# T\n', null).includes('dsfr-site'));
assert(!render('# T\n', SITE, { isEnabled: () => false }).includes('dsfr-site'));
// En-tête YAML illisible : encadré en tête de la colonne de contenu
html = render('---\ntitle: a: b\n---\n\n# T\n', SITE);
assert(html.indexOf('dsfr-preview-error') > html.indexOf('<div id="contenu"'));

// Numérotation des titres : attributs existants conservés
assert.deepStrictEqual(numberHeadings('<h2 id="a">A <em>b</em></h2><h5 class="x">C &amp; D</h5>'), {
  html: '<h2 data-dsfr-toc="0" id="a">A <em>b</em></h2><h5 data-dsfr-toc="1" class="x">C &amp; D</h5>',
  headings: [{ level: 2, title: 'A b', ref: '0' }, { level: 5, title: 'C & D', ref: '1' }],
});
assert(framePage({ content: '', parts: { breadcrumb: null }, site: {} }).includes('République <br> française'), 'valeurs par défaut du thème');

// Doc SIRH (réglages par défaut sans mkdocs.yml) : en-tête, menu principal, pied de page du site
const { DOC_SIRH } = require('../lib/site-frame');
html = render('# T\n', Object.assign({}, DOC_SIRH, { path: '/wiki/docs/RH-proximite/Esteve.md' }));
assert(html.includes('Ministères<br>Transition écologique<br>Aménagement du territoire<br>Transports<br>Ville et logement'));
assert(html.includes('<p class="fr-header__service-tagline">Portail de documentation et d\'accompagnement SIRH<br><i>Applications RH'), 'sous-titre en italique');
assert(html.includes('target="_blank" rel="noopener" class="fr-btn">Assistance Doc SIRH</a>') && html.includes('fr-icon-edit-line">Éditer</a>'));
assert(html.includes('class="fr-search-bar"') && html.includes('Ce site est édité par la Direction des Ressources Humaines') && html.includes('Webmestre-DSNUMRH'));
assert(/aria-current="true">RH proximité</.test(html) && (html.match(/aria-current="true"/g) || []).length === 1, 'rubrique de la page mise en évidence');
assert(!render('# T\n', Object.assign({}, DOC_SIRH, { path: '/docs/Ailleurs/p.md' })).includes('aria-current="true"'));

// Réglages du thème lus dans le mkdocs.yml
const cfg = parseConfig([
  'site_name: Doc', 'repo_url: https://gitlab.example/doc', 'theme:', '  name: dsfr', '  intitule: "Ministère <br> du Travail"',
  '  afficher_menu_lateral: false', '  header:', '    titre: Doc SIRH', '    sous_titre: Modes opératoires', '  footer:', '    description: Site de la DRH',
  '    bottom_links:', '      - name: Accessibilité', '        url: /accessibilite/',
].join('\n'), '/site/mkdocs.yml');
assert.deepStrictEqual(cfg.theme, {
  intitule: 'Ministère <br> du Travail', titre: 'Doc SIRH', sousTitre: 'Modes opératoires', lateral: false, editButton: true,
  footerDescription: 'Site de la DRH', bottomLinks: [{ name: 'Accessibilité', url: '/accessibilite/', icon: undefined }],
});
assert.strictEqual(parseConfig('theme:\n  afficher_bouton_editer: false\nrepo_url: x\n', '/m.yml').theme.editButton, false);
assert.strictEqual(parseConfig('site_name: x\n', '/m.yml').theme.editButton, false, 'sans dépôt : pas de bouton Éditer');

console.log('Mise en page comme le site : en-tête, menu latéral (sommaire de la page), contenu, pied de page, réglages du mkdocs.yml OK');
