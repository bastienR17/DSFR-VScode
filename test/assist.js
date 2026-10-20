// Autocomplétion et aide au survol (lib/assist.js)
const assert = require('assert');
const path = require('path');
const { completions, hover } = require('../lib/assist');

const media = path.join(__dirname, '..', 'media', 'dsfr');
const assets = { artworkDir: path.join(media, 'artwork', 'pictograms'), cssFiles: [path.join(media, 'dsfr.min.css'), path.join(media, 'utility', 'utility.min.css')] };
// Le curseur est marqué par « ¦ » dans le texte
function at(text) {
  const lines = text.split('\n');
  const line = lines.findIndex((l) => l.includes('¦'));
  const character = lines[line].indexOf('¦');
  lines[line] = lines[line].replace('¦', '');
  return { lines, line, character };
}
const complete = (text) => {
  const p = at(text);
  return completions(p.lines, p.line, p.character, assets);
};
const labels = (r) => r.items.map((i) => i.label);

// Noms de blocs
let r = complete('Texte\n\n/// ¦');
assert.strictEqual(labels(r).length, 15);
assert(labels(r).includes('accordion') && labels(r).includes('tile'));
const acc = r.items.find((i) => i.label === 'accordion');
assert(acc.snippet && acc.insertText === 'accordion | ${1:Titre}', 'titre obligatoire : proposé dans le snippet');
assert(acc.documentation.includes('composants/accordion/'));
assert.strictEqual(r.items.find((i) => i.label === 'alert').insertText, 'alert');
r = complete('/// til¦');
assert.strictEqual(r.from, 4);
assert.strictEqual(complete('///¦'), null, 'pas de suggestion sur une fermeture « /// »');

// Options d'un bloc, sans celles déjà écrites
r = complete('/// alert | Titre\n    type: info\n    ¦');
assert.deepStrictEqual(labels(r), ['markup', 'attrs']);
assert(r.items[0].retrigger, 'markup a une liste de valeurs : on relance la suggestion');
assert(r.items[0].documentation.includes('Valeurs : p, h1'));
r = complete('/// tile | Titre\n    pi¦');
assert.strictEqual(r.from, 4);
assert(labels(r).includes('picto'));
// Hors options : rien
assert.strictEqual(complete('/// alert | Titre\nTexte ¦'), null);
assert.strictEqual(complete('/// alert | Titre\n\n    ¦'), null, 'une ligne vide termine les options');

// Valeurs
r = complete('/// alert | Titre\n    type: wa¦');
assert.deepStrictEqual(labels(r), ['success', 'error', 'info', 'warning']);
assert.strictEqual(r.from, 10);
assert.deepStrictEqual(labels(complete('/// accordion | T\n    open: ¦')), ['true', 'false']);
assert(labels(complete('/// tile\n    picto: ¦')).includes('buildings/city-hall'));
assert(labels(complete('/// buttons\n/// button | OK\n    icon: ¦')).includes('download-line'));
assert.strictEqual(complete('/// tile\n    description: ¦'), null, 'texte libre : pas de suggestion');

// Type du bandeau dans l'en-tête YAML
r = complete('---\ntitle: Page\nnotice:\n  type: ¦\n---\n');
assert(labels(r).includes('weather-orange'));
assert.strictEqual(complete('---\nautre:\n  type: ¦\n---\n'), null);

// Survol
let h = hover(['/// accordion | Titre'], 0, 6);
assert(h.markdown.startsWith('**Accordéon**') && h.range.start === 4 && h.range.end === 13);
assert.strictEqual(hover(['/// accordion | Titre'], 0, 18), null, 'survol du titre : rien');
h = hover(['/// tile | Titre', '    variations: grey'], 1, 6);
assert(h.markdown.includes('Valeurs : grey, no-border') && h.markdown.includes('composants/tile/'), h.markdown);
assert.strictEqual(hover(['Texte', '    variations: grey'], 1, 6), null);

console.log('Autocomplétion et survol : blocs, options, valeurs, pictogrammes, icônes OK');
