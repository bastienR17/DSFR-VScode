// Couleurs DSFR des blocs « /// » dans l'éditeur (lib/decorations.js) : positions colorées
const assert = require('assert');
const { blockDecorations, COLORS } = require('../lib/decorations');

const src = [
  '---', 'title: /// pas un bloc', '---',  // 0-2 : en-tête ignoré
  '/// alert | Attention',               // 3
  '    type: warning',                   // 4
  '    open: true',                      // 5
  'Texte',                               // 6
  '    pas: une option',                 // 7 (après le contenu)
  '///',                                 // 8
  '```', '/// alert', '```',             // 9-11 : code ignoré
  '/// tabs',                            // 12
];
const d = blockDecorations(src);
const text = (r) => src[r.line].slice(r.start, r.end);
assert.deepStrictEqual(d.fence.map(text), ['///', '|', '///', '///']);
assert.deepStrictEqual(d.name.map(text), ['alert', 'tabs']);
assert.deepStrictEqual(d.title.map(text), ['Attention']);
assert.deepStrictEqual(d.key.map(text), ['type', 'open']);
assert.deepStrictEqual(d.band, [3, 8, 12]);
assert.deepStrictEqual(blockDecorations(['  /// card |   Mon titre  ', '/// col | 12 md-6']).title.map((r) => [r.line, r.start, r.end]), [[0, 15, 24], [1, 10, 17]]);
for (const k of Object.keys(COLORS)) assert(COLORS[k].light && COLORS[k].dark, k);
console.log('Couleurs des blocs /// : « /// », nom, titre, options, lignes d\'ouverture et de fermeture OK');
