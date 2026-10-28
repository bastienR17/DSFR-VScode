// Repli des blocs « /// » dans l'éditeur (lib/folding.js)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { foldingRanges } = require('../lib/folding');

const ranges = (text) => foldingRanges(text.split('\n')).map((r) => [r.start, r.end]);
assert.deepStrictEqual(ranges('/// alert | A\n    type: info\nTexte\n///\n'), [[0, 3]]);
// Imbrication : onglets et grille
assert.deepStrictEqual(ranges('/// tabs\n/// tab | Un\nA\n///\n/// tab | Deux\nB\n///\n///\n'), [[0, 7], [1, 3], [4, 6]]);
assert.deepStrictEqual(ranges('/// row\n/// col\n/// card | C\n///\n///\n///\n'), [[0, 5], [1, 4], [2, 3]]);
// Code et en-tête ignorés ; bloc jamais fermé : pas de repli
assert.deepStrictEqual(ranges('```\n/// alert\n///\n```\n'), []);
assert.deepStrictEqual(ranges('---\ntitle: ///\n---\n/// alert\nX\n///\n'), [[3, 5]]);
assert.deepStrictEqual(ranges('/// alert\nTexte\n'), []);
// Fins de ligne Windows
assert.deepStrictEqual(ranges('/// alert\r\nX\r\n///\r\n'), [[0, 2]]);
// Page de démonstration : chaque bloc se replie
const demo = fs.readFileSync(path.join(__dirname, '..', 'samples', 'demo.md'), 'utf8');
const headers = demo.split('\n').filter((l) => /^\s{0,3}\/{3,}\s*[a-z]/.test(l)).length;
assert.strictEqual(foldingRanges(demo.split('\n')).length, headers);
console.log('Repli des blocs /// : imbrication, code et en-tête ignorés OK');
