// Conseils discrets : images sans description, liens absolus vers le site (lib/quality.js)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkQuality } = require('../lib/quality');

const SITE = 'https://docsirh.e2.rie.gouv.fr';
const words = (text, issues) => issues.map((i) => text.split('\n')[i.range.line].slice(i.range.start, i.range.end));

// Images sans description
let text = [
  '![](https://docsirh.e2.rie.gouv.fr/fichiers/a.png)',
  '![Capture du menu](https://docsirh.e2.rie.gouv.fr/fichiers/b.png)',
  '<img',
  'src="https://docsirh.e2.rie.gouv.fr/fichiers/c.png"',
  'style="width:6.2in" />',
  '<img src="d.png" alt="Écran de connexion" />',
  '<img src="e.png" alt="" />',
  '```', '![](dans-du-code.png) <img src="x.png">', '```',
].join('\n');
let issues = checkQuality(text, { checkAlt: true });
assert.deepStrictEqual(issues.map((i) => [i.code, i.range.line, i.severity]), [['dsfr-img-alt', 0, 'info'], ['dsfr-img-alt', 2, 'info'], ['dsfr-img-alt', 6, 'info']]);
assert.deepStrictEqual(words(text, issues), ['![]', '<img', '<img']);
assert.strictEqual(issues[1].fixes[0].title, 'Ajouter alt="" (à compléter)');
assert.deepStrictEqual(issues[1].fixes[0].edits[0].start, { line: 2, character: 4 });
assert.deepStrictEqual(checkQuality(text, { checkAlt: false }), [], 'réglage coupé');

// Captures telles qu'écrites dans les MODOP Doc SIRH (balise sur plusieurs lignes, style) : chacune signalée
const modop = [
  '# Déposer un document', '', '/// alert |', '_Cliquer sur **Valider**._', '///', '',
  '<img', 'src="https://docsirh.e2.rie.gouv.fr/fichiers/GAUdDI_media/image1.png"', 'style="width:6.3in;height:2.1in" />', '',
  '1. Ouvrir le dossier', '', '    <img src="https://docsirh.e2.rie.gouv.fr/fichiers/GAUdDI_media/image2.png" style="width:4in" />', '',
  '<img src="https://docsirh.e2.rie.gouv.fr/fichiers/GAUdDI_media/image3.png" alt="Bouton Valider" />',
].join('\n');
issues = checkQuality(modop, { checkAlt: true, siteUrl: SITE });
assert.deepStrictEqual(issues.map((i) => [i.code, i.range.line, i.range.start]), [['dsfr-img-alt', 6, 0], ['dsfr-img-alt', 12, 4]]);

// Liens absolus vers une page du site (pas vers fichiers/)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsfr-quality-'));
fs.mkdirSync(path.join(root, 'docs', 'Assistance'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs', 'GA-PAYE'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'Assistance', 'Demandes.md'), '# Demandes\n');
fs.writeFileSync(path.join(root, 'docs', 'index.md'), '# Accueil\n');
text = [
  'Voir [la demande](https://docsirh.e2.rie.gouv.fr/Assistance/Demandes/#etapes).',
  'Accueil : [Doc SIRH](https://docsirh.e2.rie.gouv.fr/).',
  'Fichier : [Excel](https://docsirh.e2.rie.gouv.fr/fichiers/doc.xls).',
  'Autre site : [PIAG](https://piag.din.gouv.fr/chat).',
  'Page inconnue : [x](https://docsirh.e2.rie.gouv.fr/Nulle/Part/).',
].join('\n');
const ctx = { checkAlt: true, siteUrl: SITE + '/', file: path.join(root, 'docs', 'GA-PAYE', 'page.md'), docsDir: path.join(root, 'docs'), exists: fs.existsSync };
issues = checkQuality(text, ctx);
assert.deepStrictEqual(issues.map((i) => [i.code, i.range.line]), [['dsfr-absolute-link', 0], ['dsfr-absolute-link', 1], ['dsfr-absolute-link', 4]]);
assert.strictEqual(issues[0].fixes[0].title, 'Remplacer par le lien relatif « ../Assistance/Demandes.md#etapes »');
assert.strictEqual(issues[1].fixes[0].edits[0].text, '../index.md');
assert.strictEqual(issues[2].fixes.length, 0, 'page introuvable : pas de lien proposé');
// Sans mkdocs.yml (pas de docs_dir) : signalé, sans correction
issues = checkQuality(text, { siteUrl: SITE });
assert.strictEqual(issues.length, 3);
assert(issues.every((i) => !i.fixes.length));
assert.deepStrictEqual(checkQuality(text, { siteUrl: '' }), [], 'adresse du site vide : pas de vérification');
fs.rmSync(root, { recursive: true, force: true });

// Défauts visibles sur le site (cas relevés sur de vraies pages Doc SIRH)
const apply = (t, edits) => {
  const ls = t.split('\n');
  const off = (p) => ls.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  for (const e of edits.slice().sort((a, b) => off(b.start) - off(a.start))) t = t.slice(0, off(e.start)) + e.text + t.slice(off(e.end));
  return t;
};
const warnings = (t) => checkQuality(t, { checkAlt: false }).filter((i) => i.severity === 'warning');
// Lien sans « ] »
text = 'Inscription sur le [**site Formation**(https://formation.e2.rie.gouv.fr).\n';
issues = warnings(text);
assert.deepStrictEqual(issues.map((i) => i.code), ['dsfr-link-broken']);
assert.strictEqual(apply(text, issues[0].fixes[0].edits), 'Inscription sur le [**site Formation**](https://formation.e2.rie.gouv.fr).\n');
// Lien sans « ) »
text = 'Voir [la page](https://docsirh.e2.rie.gouv.fr/fichiers/a.pdf\n';
issues = warnings(text);
assert.deepStrictEqual(issues.map((i) => i.code), ['dsfr-link-broken']);
assert.strictEqual(apply(text, issues[0].fixes[0].edits), 'Voir [la page](https://docsirh.e2.rie.gouv.fr/fichiers/a.pdf)\n');
assert.deepStrictEqual(warnings('[ok](https://a.fr) et [ok](https://b.fr "titre") et `[code(https://c.fr)`\n'), [], 'liens corrects et code en ligne');
// Astérisques échappés
text = '- \\*\\*A’ \\*\\*: Acquis (à date)\n- Code «\\*\\*004-NIGANIGF-00\\*\\*».\n';
issues = warnings(text);
assert.deepStrictEqual(issues.map((i) => [i.code, i.range.line]), [['dsfr-escaped-strong', 0], ['dsfr-escaped-strong', 1]]);
assert.strictEqual(apply(text, issues[0].fixes[0].edits.concat(issues[1].fixes[0].edits)), '- **A’** : Acquis (à date)\n- Code «**004-NIGANIGF-00**».\n');
assert.deepStrictEqual(warnings('Un seul \\* échappé, et 2 \\* 3.\n'), []);
// Titre coupé en deux
text = '# Page\n\n### 1er cas : le cycle avec la bonne durée et la bonne\n\njournée non travaillée existe\n\nTexte.\n';
issues = warnings(text);
assert.deepStrictEqual(issues.map((i) => [i.code, i.range.line]), [['dsfr-split-heading', 2]]);
assert.strictEqual(apply(text, issues[0].fixes[0].edits), '# Page\n\n### 1er cas : le cycle avec la bonne durée et la bonne journée non travaillée existe\n\nTexte.\n');
for (const ok of [
  '## Titre :\n\nsuite en minuscule\n',           // titre terminé par « : »
  '## Titre\n\nUne phrase normale\n',              // majuscule
  '## Titre\n\nparagraphe sur\ndeux lignes\n',    // vrai paragraphe
  '## Titre\n\nune phrase complète.\n',            // phrase terminée
  '---\n# commentaire YAML\n\nvaleur\n---\n',       // en-tête YAML
  '```\n# commentaire\n\ncode\n```\n',             // bloc de code
]) assert.deepStrictEqual(warnings(ok), [], ok);

console.log('Conseils : images sans description, liens absolus vers le site ; liens mal formés, astérisques échappés, titres coupés OK');
