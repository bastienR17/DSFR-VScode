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
// Chaque encadré indique la ligne du problème (la même que le soulignement dans l'éditeur)
// et porte data-line : un double-clic dans l'aperçu ramène l'éditeur à cette ligne.
const boxLines = [...errors.matchAll(/class="dsfr-preview-error [^"]*code-line" data-line="(\d+)"[^>]*><p class="dsfr-preview-error__label">[^<]*<span class="dsfr-preview-error__line">· ligne (\d+)</g)]
  .map((m) => { assert.strictEqual(Number(m[2]), Number(m[1]) + 1); return Number(m[1]); });
assert.strictEqual(boxLines.length, expected, 'chaque encadré doit indiquer sa ligne');
const { createLinter } = require('../lib/lint');
const editorLines = createLinter()(read('erreurs.md')).map((i) => i.range.line);
const fileLines = read('erreurs.md').split('\n');
for (const l of editorLines) {
  // même ligne, ou ligne d'en-tête du bloc pour une option soulignée plus bas
  const near = boxLines.some((b) => b === l || (b < l && l - b <= 4 && /^\s{4,}\w+\s*:/.test(fileLines[l])));
  assert(near, 'problème ligne ' + (l + 1) + ' sans encadré à la même ligne : ' + boxLines.map((b) => b + 1).join(', '));
}
console.log('Pages d\'exemple : demo.md sans erreur, erreurs.md avec ' + expected + ' erreurs signalées, chacune avec sa ligne OK');
