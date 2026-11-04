// Panneau « Composants » (lib/component-panel.js) : familles, vignettes, recherche, message d'insertion.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { panelHtml, FAMILY_COLORS } = require('../lib/component-panel');
const { buildMenu, FAMILIES } = require('../lib/component-menu');
const snippets = require('../snippets/dsfr.json');

const items = buildMenu(snippets).filter((m) => !m.separator);
// Une vignette pour chaque composant (node scripts/thumbnails.js les régénère)
for (const m of items) assert(fs.existsSync(path.join(__dirname, '..', 'media', 'thumbnails', m.prefix + '.jpg')), 'vignette manquante : ' + m.prefix + ' (lancer node scripts/thumbnails.js)');
for (const f of FAMILIES) assert(FAMILY_COLORS[f.id] && FAMILY_COLORS[f.id].length === 2, 'couleur de la famille ' + f.id);

const html = panelHtml({ snippets, cspSource: 'vscode-resource:', nonce: 'abc123', thumb: (p) => (p === 'dsfr-alerte' ? 'vscode-resource:/t/' + p + '.jpg' : null) });
assert.strictEqual((html.match(/<button class="card"/g) || []).length, items.length, 'une carte par composant');
assert.strictEqual((html.match(/<details class="family"/g) || []).length, new Set(items.map((m) => m.family)).size);
assert(html.includes('<script nonce="abc123">'));
assert(/default-src 'none'; img-src vscode-resource:/.test(html));
assert.strictEqual((html.match(/<img /g) || []).length, 1, 'image seulement quand la vignette existe');
assert(html.includes('data-prefix="dsfr-alerte"'));
assert(!/<script(?! nonce)/.test(html), 'aucun script sans jeton');
// Textes échappés (apostrophes, guillemets des noms)
assert(!/title="Insérer « [^»]*"[^>]*» dans/.test(html));
console.log('Panneau des composants : ' + items.length + ' composants, vignettes, familles colorées et sécurité OK');
