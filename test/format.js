// Barre de mise en forme (lib/format.js) : gras, italique, titres, listes, liens
const assert = require('assert');
const { toggleInline, setHeading, toggleList, linkSnippet, looksLikeUrl } = require('../lib/format');

const apply = (doc, r) => doc.slice(0, r.start) + r.text + doc.slice(r.end);
const sel = (doc, r) => apply(doc, r).slice(r.select[0], r.select[1]);
let doc = 'Cliquer sur Rechercher puis valider.';
let r = toggleInline(doc, 12, 22, 'bold'); // « Rechercher »
assert.strictEqual(apply(doc, r), 'Cliquer sur **Rechercher** puis valider.');
assert.strictEqual(sel(doc, r), 'Rechercher');
// Espaces sélectionnés aux bords : hors des « ** »
r = toggleInline(doc, 11, 23, 'bold');
assert.strictEqual(apply(doc, r), 'Cliquer sur **Rechercher** puis valider.');
// Re-cliquer : le gras est retiré (sélection dedans, ou avec les marques)
const bold = 'Cliquer sur **Rechercher** puis.';
assert.strictEqual(apply(bold, toggleInline(bold, 14, 24, 'bold')), 'Cliquer sur Rechercher puis.');
assert.strictEqual(apply(bold, toggleInline(bold, 12, 26, 'bold')), 'Cliquer sur Rechercher puis.');
// Sans sélection : le mot sous le curseur ; hors d'un mot : les marques, curseur au milieu
assert.strictEqual(apply(doc, toggleInline(doc, 15, 15, 'bold')), 'Cliquer sur **Rechercher** puis valider.');
r = toggleInline('a  b', 2, 2, 'italic');
assert.deepStrictEqual([apply('a  b', r), r.select], ['a ** b', [3, 3]]);
// Italique, et italique dans du gras
assert.strictEqual(apply(doc, toggleInline(doc, 28, 35, 'italic')), 'Cliquer sur Rechercher puis *valider*.');
assert.strictEqual(apply(bold, toggleInline(bold, 14, 24, 'italic')), 'Cliquer sur ***Rechercher*** puis.');
const both = '***x***';
assert.strictEqual(apply(both, toggleInline(both, 3, 4, 'italic')), '**x**');
assert.strictEqual(apply(both, toggleInline(both, 3, 4, 'bold')), '*x*');
const it = '*mot*';
assert.strictEqual(apply(it, toggleInline(it, 1, 4, 'bold')), '***mot***', 'gras sur un mot en italique');
// Plusieurs lignes : chaque ligne (après la puce) ; les lignes vides restent vides
doc = '- Un\n\n- Deux';
assert.strictEqual(apply(doc, toggleInline(doc, 0, doc.length, 'bold')), '- **Un**\n\n- **Deux**');

// Titres
const lines = ['Texte', '## Ancien titre', '- puce', '', '**Gras seul**'];
assert.deepStrictEqual(setHeading(lines, 0, 0, 2).lines, ['## Texte']);
assert.deepStrictEqual(setHeading(lines, 1, 1, 3).lines, ['### Ancien titre']);
assert.deepStrictEqual(setHeading(lines, 1, 1, 0).lines, ['Ancien titre']);
assert.deepStrictEqual(setHeading(lines, 2, 4, 2).lines, ['## puce', '', '## Gras seul']);

// Listes
let l = toggleList(['Intro :', 'Un', 'Deux'], 1, 2, 'bullet');
assert.deepStrictEqual(l, { from: 1, to: 2, lines: ['', '- Un', '- Deux'] }, 'ligne vide ajoutée après le paragraphe');
l = toggleList(['', 'Un', '', 'Deux'], 1, 3, 'numbered');
assert.deepStrictEqual(l.lines, ['1. Un', '', '2. Deux']);
assert.deepStrictEqual(toggleList(['- Un', '- Deux'], 0, 1, 'bullet').lines, ['Un', 'Deux'], 'retrait');
assert.deepStrictEqual(toggleList(['- Un', '- Deux'], 0, 1, 'numbered').lines, ['1. Un', '2. Deux'], 'puces → numéros');
assert.deepStrictEqual(toggleList(['    - Sous'], 0, 0, 'numbered').lines, ['    1. Sous'], 'indentation gardée');
assert.deepStrictEqual(toggleList(['- a', 'b'], 1, 1, 'bullet').lines, ['- b'], 'suite d\'une liste : pas de ligne vide');

// Liens
assert.strictEqual(linkSnippet('le site', 'https://www.service-public.fr/'), '[le site](https://www.service-public.fr/)$0');
assert.strictEqual(linkSnippet('', '../GA-PAYE/page.md'), '[${1:texte du lien}](../GA-PAYE/page.md)$0');
assert.strictEqual(linkSnippet('100 $', 'a b'), '[100 \\$](a%20b)$0');
assert(looksLikeUrl('https://x.fr') && looksLikeUrl('../page.md') && !looksLikeUrl('bonjour'));
console.log('Barre de mise en forme : gras, italique, titres, listes et liens OK');
