// Commande « Insérer un composant » (lib/component-menu.js) : familles, libellés, place des clés d'en-tête
const assert = require('assert');
const snippets = require('../snippets/dsfr.json');
const { buildMenu, headerPlacement, FAMILIES } = require('../lib/component-menu');

const menu = buildMenu(snippets);
const items = menu.filter((i) => !i.separator);
assert.strictEqual(items.length, Object.keys(snippets).length, 'chaque snippet est dans la liste');
assert(!items.some((i) => i.family === 'other'), 'aucun composant hors famille : ' + items.filter((i) => i.family === 'other').map((i) => i.prefix));
assert.deepStrictEqual(menu.filter((i) => i.separator).map((i) => i.label), FAMILIES.map((f) => f.label), 'familles dans l\'ordre');
assert.strictEqual(menu[0].label, 'Doc SIRH — les blocs de l\'équipe');
const get = (p) => items.find((i) => i.prefix === p);
assert.strictEqual(get('dsfr-alerte').label, 'Alerte');
assert.strictEqual(get('dsfr-sirh-capture').label, 'Capture d\'écran');
assert.strictEqual(get('dsfr-sirh-capture').icon, 'device-camera');
assert(get('dsfr-sirh-capture').detail.startsWith('Capture d\'écran hébergée'), get('dsfr-sirh-capture').detail);
assert.strictEqual(get('dsfr-bandeau').label, 'Bandeau d\'information');
assert(get('dsfr-tuile-3').body.includes('/// tile |'));

// En-tête de page : dans l'en-tête existant, sinon dans un nouvel en-tête
const bandeau = get('dsfr-bandeau');
let at = headerPlacement(['---', 'title: Page', '---', '', '# Titre'], bandeau);
assert.deepStrictEqual([at.line, at.character], [2, 0]);
assert(at.text.startsWith('notice:\n') && at.text.endsWith('\n') && !at.text.includes('$0'), JSON.stringify(at.text));
at = headerPlacement(['# Titre', '', 'Texte'], get('dsfr-sommaire'));
assert.deepStrictEqual(at, { line: 0, character: 0, text: '---\nsummary: true\n---\n\n$0' });
assert(headerPlacement(['---', 'a: b', '---'], get('dsfr-entete')).error, 'en-tête déjà présent');
at = headerPlacement(['# Titre'], get('dsfr-entete'));
assert(at.text.startsWith('---\nbreadcrumb:') && at.line === 0);
assert.strictEqual(headerPlacement(['x'], get('dsfr-alerte')), null, 'composant de page : au curseur');

console.log('Insérer un composant : familles, libellés, place des clés d\'en-tête OK');
