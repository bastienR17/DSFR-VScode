// Commande « Nouvelle version » (lib/version-row.js) : ligne ajoutée au tableau « Suivi des modifications »
const assert = require('assert');
const { addVersionRow, nextVersion } = require('../lib/version-row');

const today = new Date(2026, 10, 4); // 04/11/2026
const page = [
  '# Titre', '', '/// accordion | **Suivi des modifications**', '',
  '| **Version** | **Date** | **Emetteur** | **Suivi des modifications** |',
  '|----|----|----|----|',
  '| V1 | 01/02/2025 | MATTE / DSNUMRH4 | Création |',
  '| V2 | 03/05/2026 | MATTE / DSNUMRH4 | Ajout \\| capture |',
  '', '///',
];
// Version la plus récente en bas : la ligne va à la fin du tableau ; le curseur sur « ce qui a changé »
let r = addVersionRow(page, { today });
assert.deepStrictEqual(r, { line: 8, snippet: '| V3 | 04/11/2026 | ${2:MATTE / DSNUMRH4} | ${1:Ce qui a changé} |\n', version: 'V3', position: 'bottom' });
// Version la plus récente en haut : en haut du tableau
const reversed = page.slice();
[reversed[6], reversed[7]] = [reversed[7], reversed[6]];
r = addVersionRow(reversed, { today });
assert.strictEqual(r.line, 6);
assert.strictEqual(r.position, 'top');
assert.strictEqual(r.version, 'V3');
// Tableau sans ligne, colonnes dans un autre ordre, sans colonne « émetteur »
r = addVersionRow(['| Date | Version | Objet |', '|---|---|---|'], { today });
assert.deepStrictEqual([r.line, r.snippet], [2, '| 04/11/2026 | V1 | ${1:Ce qui a changé} |\n']);
// Tableau dans un bloc de code : ignoré ; pas de tableau : message
assert(addVersionRow(['```', '| Version | Date |', '|---|---|', '```'], { today }).noTable);
assert(/Suivi des modifications/.test(addVersionRow(['# x'], { today }).error));
// Émetteur contenant « $ » ou « } » : protégé dans le snippet
r = addVersionRow(['| Version | Date | Emetteur | Suivi |', '|--|--|--|--|', '| V1 | 01/01/2026 | A } $B | x |'], { today });
assert(r.snippet.includes('${2:A \\} \\$B}'), r.snippet);
// Numéros
assert.deepStrictEqual(['V2', '**V1.2**', '3', 'V1,9', 'x'].map(nextVersion), ['V3', '**V1.3**', '4', 'V1,10', null]);
console.log('Nouvelle version : numéro suivant, date du jour, émetteur repris, en haut ou en bas du tableau OK');
