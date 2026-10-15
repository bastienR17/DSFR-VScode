// Les pages d'exemple restent valides : demo.md sans aucune erreur, erreurs.md avec une erreur par section.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const createMd = require('./vscode-like.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'samples', name), 'utf8');
const count = (html) => (html.match(/class="dsfr-preview-error /g) || []).length;

const demo = createMd({ showErrors: () => true }).render(read('demo.md'), {});
assert.strictEqual(count(demo), 0, 'demo.md ne doit signaler aucune erreur :\n' + demo);
for (const cls of ['fr-notice', 'fr-breadcrumb', 'fr-summary', 'fr-alert', 'fr-callout', 'fr-highlight', 'fr-accordion',
  'fr-tabs', 'fr-table', 'fr-badge', 'fr-card', 'fr-tile', 'fr-btns-group', 'fr-quote', 'fr-artwork']) {
  assert(demo.includes(cls), 'demo.md devrait contenir ' + cls);
}

const errors = createMd({ showErrors: () => true }).render(read('erreurs.md'), {});
// Une erreur par section « ## », plus l'en-tête YAML volontairement fautif
const expected = (read('erreurs.md').match(/^## /gm) || []).length + (read('erreurs.md').startsWith('---') ? 1 : 0);
assert.strictEqual(count(errors), expected, 'erreurs.md : une erreur attendue par section, plus l\'en-tête');
assert(errors.includes("title: 'Guide: erreurs courantes'"), 'la correction de l\'en-tête doit être proposée');
console.log('Pages d\'exemple : demo.md sans erreur, erreurs.md avec ' + expected + ' erreurs signalées OK');
