// Analyse et correction des en-têtes YAML (lib/frontmatter.js)
const assert = require('assert');
const { analyzeFrontMatter, fixFrontMatter } = require('../lib/frontmatter.js');

// Le cas signalé : valeur contenant « : »
const bad = "---\ntitle: mentor: Déposer les documents\n---\n\n# Titre\n";
const info = analyzeFrontMatter(bad);
assert(info.error && info.meta === null, 'en-tête illisible attendu');
assert.strictEqual(info.fixes.length, 1);
assert.strictEqual(info.fixes[0].line, 1);
const fixed = fixFrontMatter(bad);
assert.strictEqual(fixed.text, "---\ntitle: 'mentor: Déposer les documents'\n---\n\n# Titre\n");
assert.deepStrictEqual(analyzeFrontMatter(fixed.text).meta, { title: 'mentor: Déposer les documents' });

// Apostrophes doublées, fins de ligne Windows conservées, autres lignes intactes
const crlf = "---\r\ntitle: mentor: l'agent\r\nsource_url: https://exemple.gouv.fr/page\r\n---\r\n\r\nTexte\r\n";
const f2 = fixFrontMatter(crlf);
assert.strictEqual(f2.text, "---\r\ntitle: 'mentor: l''agent'\r\nsource_url: https://exemple.gouv.fr/page\r\n---\r\n\r\nTexte\r\n");
assert.deepStrictEqual(analyzeFrontMatter(f2.text).meta, { title: "mentor: l'agent", source_url: 'https://exemple.gouv.fr/page' });

// Plusieurs lignes fautives, et valeur finissant par « : »
const multi = "---\ntitle: A: B\ndescription: Étapes :\nauthor: X\n---\n";
const f3 = fixFrontMatter(multi);
assert.strictEqual(f3.fixes.length, 2);
assert.deepStrictEqual(analyzeFrontMatter(f3.text).meta, { title: 'A: B', description: 'Étapes :', author: 'X' });

// Rien à corriger : en-tête valide, valeur déjà entre guillemets, adresse avec « : » sans espace
for (const ok of ["---\ntitle: 'mentor: X'\n---\n", "---\ntitle: \"mentor: X\"\n---\n", "---\nurl: https://a.fr\n---\n", "# Sans en-tête\n"]) {
  assert.strictEqual(fixFrontMatter(ok), null, ok);
}
// Illisible pour une autre raison : signalé, mais pas de correction automatique
const other = "---\ntitle: [non fermé\n---\n";
assert(analyzeFrontMatter(other).error);
assert.strictEqual(fixFrontMatter(other), null);
console.log('En-têtes YAML : détection et correction des valeurs contenant « : » OK');
