// Collage depuis Word, Excel, Google Docs ou le web (lib/html-to-markdown.js) ; le Markdown obtenu est
// aussi vérifié par le rendu (le même que l'aperçu) et, dans test/cases.json, comparé au site.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { htmlToMarkdown, tabsToTable, plainToMarkdown } = require('../lib/html-to-markdown');
const createMd = require('./vscode-like');

const fixture = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const md = createMd({ showErrors: () => true });

// Word : titre, gras sans espace dans les « ** », listes et sous-listes (4 espaces), tableau, lien, image
let r = htmlToMarkdown(fixture('word-modop.html'));
assert.strictEqual(r.source, 'word');
assert.strictEqual(r.images, 2, 'images de Word (doublon VML compté une fois)');
assert.strictEqual(r.markdown, [
  '## Rechercher l’acte',
  '',
  'Dans l’écran **Gestion des actes**, cliquer sur **Rechercher** puis saisir le *matricule*.',
  '',
  '- Premier point',
  '    - Sous-point',
  '- Deuxième point avec un [lien](https://docsirh.e2.rie.gouv.fr/GA-PAYE/)',
  '',
  '<!-- -->',
  '',
  '1. Ouvrir RenoiRH',
  '2. Valider \\*2\\* fois',
  '',
  '| **Version** | **Date** | **Suivi** |',
  '|----|----|----|',
  '| V1 | 01/02/2026 | Création<br>Ligne 2 \\| pipe |',
  '| Fusion |   | x |',
  '',
  '![Description de l\'image](https://docsirh.e2.rie.gouv.fr/fichiers/)',
  '',
  '![Écran de recherche de l\'acte](https://docsirh.e2.rie.gouv.fr/fichiers/)',
  '',
  '\\# pas un titre',
].join('\n'));
let html = md.render(r.markdown);
assert(/<ul>\s*<li>Premier point\s*<ul>\s*<li>Sous-point<\/li>/.test(html), 'sous-liste');
assert(/<ol>\s*<li>Ouvrir RenoiRH<\/li>/.test(html));
assert(/<table[\s\S]*<strong>Version<\/strong>[\s\S]*Ligne 2 \| pipe/.test(html), 'tableau');
assert(!/<h1>/.test(html) && /<p># pas un titre<\/p>/.test(html));
assert(!html.includes('dsfr-error'), 'aucune erreur dans le rendu');
// Images : snippet VS Code, curseur sur le nom du fichier (1), puis la description (2), image suivante (3, 4)
assert(r.snippet.includes('![${2:Description de l\'image}](https://docsirh.e2.rie.gouv.fr/fichiers/${1})\n\n![${4:Écran de recherche de l\'acte}](https://docsirh.e2.rie.gouv.fr/fichiers/${3})'), r.snippet);
assert(r.snippet.includes('Valider \\\\*2\\\\* fois') && r.snippet.endsWith('$0'), 'texte protégé dans le snippet');
assert.strictEqual(htmlToMarkdown('<p><b>x</b></p>').snippet, null, 'sans image : texte simple');
assert.strictEqual(htmlToMarkdown('<img src="a.png" alt="A">', { imageBase: 'https://exemple.fr/fichiers' }).markdown, '![A](https://exemple.fr/fichiers/)');

// Le même contenu Word réécrit par un navigateur (styles « mso-list » et retraits supprimés) : même résultat
assert.strictEqual(htmlToMarkdown(fixture('word-navigateur.html')).markdown, r.markdown);
// Blocs de Word sous forme de commentaires : <!--[if !supportLists]-->…<!--[endif]-->
assert.strictEqual(htmlToMarkdown('<p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><!--[if !supportLists]--><span>1.&nbsp;</span><!--[endif]-->Un</p><p><!--[if !vml]--><img src="x.png" alt="A"><!--[endif]--></p>').markdown, '1. Un\n\n![A](https://docsirh.e2.rie.gouv.fr/fichiers/)');
assert.strictEqual(htmlToMarkdown('<p>Avant</p><p><img src="a.png" alt="A"></p>').rich, true, 'une image suffit');

// Google Docs : la page entière est dans un <b style="font-weight:normal">
r = htmlToMarkdown(fixture('gdocs.html'));
assert.strictEqual(r.markdown, '## Saisir la date\n\nTexte **gras** et *italique*\n\n- Un\n    - Un-a\n- Deux\n\n| **Champ** | **Valeur** |\n|----|----|\n| Date d\'effet | 01/01/2027 |');

// Excel
r = htmlToMarkdown(fixture('excel.html'));
assert.strictEqual(r.source, 'excel');
assert.strictEqual(r.markdown, '| Code | Libellé |\n|----|----|\n| 0101 | Traitement brut |\n| 0202 | Indemnité de résidence |');

// Page web : lien en gras, saut de ligne, citation, caractères à protéger
r = htmlToMarkdown('<div><p>Voir <a href="https://www.service-public.fr/"><strong>le site</strong></a>.</p><p>Ligne<br>suivante</p><blockquote><p>Citation</p></blockquote><p>snake_case et _x_ et a*b &lt;b&gt;</p><a href="#ancre">ancre</a> <a href="javascript:x()">js</a></div>');
assert.strictEqual(r.markdown, 'Voir [**le site**](https://www.service-public.fr/).\n\nLigne  \nsuivante\n\n> Citation\n\nsnake_case et \\_x\\_ et a\\*b &lt;b>\n\nancre js');
// Cellules fusionnées verticalement, colonnes vides retirées, simple texte non « riche »
assert.strictEqual(htmlToMarkdown('<table><tr><th>A</th><th>B</th><th></th></tr><tr><td rowspan=2>x</td><td>1</td><td></td></tr><tr><td>2</td></tr></table>').markdown,
  '| A | B |\n|----|----|\n| x | 1 |\n|   | 2 |');
assert.strictEqual(htmlToMarkdown('<span>juste du texte</span>').rich, false);
assert.strictEqual(htmlToMarkdown('<p><b>Gras</b> <i> italique </i>!</p>').markdown, '**Gras** *italique* !');
assert.strictEqual(htmlToMarkdown('<h3><b>Titre en gras</b></h3>').markdown, '### Titre en gras', 'pas de gras dans un titre');
assert.strictEqual(htmlToMarkdown('<ol start="3"><li>Trois</li><li>Quatre</li></ol>').markdown, '3. Trois\n4. Quatre');
assert.strictEqual(htmlToMarkdown('<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a)</span>Lettre</p>').markdown, '1. Lettre', 'liste Word sans <![if]>');

// Simple texte : Excel (tabulations) et Word (une ligne par paragraphe, puces)
assert.strictEqual(tabsToTable('Nom\tMontant\r\nDupont\t12\r\nMartin\t\r\n'), '| Nom | Montant |\n|----|----|\n| Dupont | 12 |\n| Martin |   |');
assert.strictEqual(tabsToTable('pas\nun tableau'), null);
assert.strictEqual(plainToMarkdown('Titre\r\nPremier.\r\n•\tUn\r\n•\tDeux\r\n\to\tDeux-a\r\n1. Num\r\nFin.'),
  'Titre\n\nPremier.\n\n- Un\n- Deux\n    - Deux-a\n1. Num\n\nFin.');
console.log('Collage depuis Word, Excel, Google Docs et le web : titres, gras, listes, tableaux, liens, images OK');

// Collage au milieu du texte : lignes vides autour des blocs, rien pour un simple mot
const { surround } = require('../lib/html-to-markdown');
assert.strictEqual(surround('mot', { before: 'Un ', after: ' deux', prevLine: 'x', nextLine: 'y' }), 'mot');
assert.strictEqual(surround('| a | b |\n|--|--|', { before: 'Texte', after: '', prevLine: '', nextLine: '' }), '\n\n| a | b |\n|--|--|');
assert.strictEqual(surround('- a\n- b', { before: '', after: '', prevLine: 'Intro :', nextLine: 'Suite' }), '\n- a\n- b\n');
assert.strictEqual(surround('## T', { before: '', after: 'reste', prevLine: '', nextLine: '' }), '## T\n\n');
console.log('Collage : lignes vides autour des blocs OK');
