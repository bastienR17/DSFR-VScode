// Liens, images et ancres de la page (lib/links.js), et lecture du mkdocs.yml (lib/mkdocs-config.js)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkLinks, anchorsOf, slugAscii, slugUnicode } = require('../lib/links');
const { findConfig, parseConfig, checkExtensions } = require('../lib/mkdocs-config');

// Petit site de test : mkdocs.yml, docs/index.md, docs/guides/page.md, docs/img/logo.png
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsfr-links-'));
const write = (p, t) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t); };
write('mkdocs.yml', 'site_name: Test\ntheme:\n  name: dsfr\nmarkdown_extensions:\n  - dsfr_structure.extension.all_extensions\n  - attr_list\n  - pymdownx.emoji:\n      emoji_index: !!python/name:material.extensions.emoji.twemoji\n  - toc:\n      permalink: true\nextra:\n  key: !ENV [CLE, defaut]\n');
write('docs/guides/page.md', '# Déposer les documents\n\n## Étape 1 : préparer\n\n## Étape 1 : préparer\n\n## Ancre manuelle { #ma-cible }\n');
write('docs/img/logo.png', 'png');
write('docs/doc.pdf', 'pdf');
const ctx = (file) => ({
  file: path.join(root, file),
  docsDir: path.join(root, 'docs'),
  exists: (p) => fs.existsSync(p),
  read: (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
});
const codes = (issues) => issues.map((i) => i.code + '@' + i.range.line);
const words = (text, issues) => issues.map((i) => text.split('\n')[i.range.line].slice(i.range.start, i.range.end));

// Identifiants des titres, comme MkDocs
assert.strictEqual(slugAscii('Étape 1 : préparer'), 'etape-1-preparer');
assert.strictEqual(slugUnicode('Étape 1 : préparer'), 'étape-1-préparer');
const a = anchorsOf(fs.readFileSync(path.join(root, 'docs/guides/page.md'), 'utf8'));
for (const id of ['deposer-les-documents', 'etape-1-preparer', 'etape-1-preparer_1', 'étape-1-préparer', 'ma-cible']) assert(a.has(id), id + ' absent : ' + [...a]);

// Liens corrects : rien à signaler
let text = [
  '---', 'breadcrumb:', '  - Accueil: /', '  - Page', '---', '',
  '# Accueil', '',
  '[Guide](guides/page.md) [Étape](guides/page.md#etape-1-preparer) [Cible](guides/page.md#ma-cible)',
  '[Absolu](/guides/page.md) [Ici](#accueil) [Web](https://exemple.gouv.fr/x.md) [Dossier](guides/)',
  '![Logo](img/logo.png) [PDF](doc.pdf) [Mail](mailto:a@b.fr)',
  '', '/// tile | Tuile', '    target: guides/page.md', '///',
  '', '/// card | Carte', '    image: img/logo.png', '///',
].join('\n');
assert.deepStrictEqual(checkLinks(text, ctx('docs/index.md')), []);

// Liens cassés
text = [
  '# Accueil', '',
  'Voir [la page](guides/absente.md) et [l\'étape](guides/page.md#etape-2) puis [ici](#nulle-part).',
  '![Logo](img/absent.png) [PDF](doc-absent.pdf) [Absolu](/absent.md)',
  '', '/// card | Carte', '    image: img/manquante.jpg', '    target: guides/page.md', '///',
  '', '```', '/// card | Exemple dans un bloc de code', '    image: ignore.png', '```',
].join('\n');
let issues = checkLinks(text, ctx('docs/index.md'));
assert.deepStrictEqual(words(text, issues), ['guides/absente.md', 'guides/page.md#etape-2', '#nulle-part', 'img/absent.png', 'doc-absent.pdf', '/absent.md', 'img/manquante.jpg']);
assert.deepStrictEqual(issues.map((i) => i.code), ['dsfr-link-missing', 'dsfr-anchor-missing', 'dsfr-anchor-missing', 'dsfr-file-missing', 'dsfr-file-missing', 'dsfr-link-missing', 'dsfr-file-missing']);
assert(issues[3].message.startsWith('Image'));
assert(issues[4].message.startsWith('Fichier'));
assert(issues.every((i) => i.severity === 'warning'));

// Sans mkdocs.yml : les liens absolus ne sont pas vérifiés
issues = checkLinks('[Absolu](/absent.md)', Object.assign(ctx('docs/index.md'), { docsDir: null }));
assert.deepStrictEqual(issues, []);

// Adresses avec espaces ou accents
write('docs/mon guide.md', '# Titre\n');
assert.deepStrictEqual(checkLinks('[A](<mon guide.md>) [B](mon%20guide.md)', ctx('docs/index.md')), []);
issues = checkLinks('[A](<mon guïde.md>)', ctx('docs/index.md'));
assert.strictEqual(issues.length, 1);

// mkdocs.yml : recherche en remontant, balises MkDocs ignorées
const cfgPath = findConfig(path.join(root, 'docs', 'guides'), root, fs.existsSync);
assert.strictEqual(cfgPath, path.join(root, 'mkdocs.yml'));
assert.strictEqual(findConfig(path.join(root, 'docs'), path.join(root, 'docs'), fs.existsSync), null, 'pas au-delà du dossier ouvert');
const cfg = parseConfig(fs.readFileSync(cfgPath, 'utf8'), cfgPath);
assert.strictEqual(cfg.docsDir, path.join(root, 'docs'));
assert.deepStrictEqual([...cfg.extensions], ['dsfr_structure.extension.all_extensions', 'attr_list', 'pymdownx.emoji', 'toc']);
assert.strictEqual(parseConfig('docs_dir: pages\n', '/site/mkdocs.yml').docsDir, path.resolve('/site/pages'));
assert.strictEqual(parseConfig(': : :\n  - [', '/x/mkdocs.yml'), null);

// Syntaxes non activées dans le mkdocs.yml
const page = '---\ntitle: T\n---\n\n/// alert | A\nTexte\n///\n\n!!! note\n    Encadré\n\n??? info "Détails"\n    Caché\n\n## Titre { #id }\n\nTerme\n: Définition\n\n```\n!!! dans du code\n```\n';
issues = checkExtensions(page, cfg);
assert.deepStrictEqual(codes(issues), ['dsfr-mkdocs-extension@8', 'dsfr-mkdocs-extension@11', 'dsfr-mkdocs-extension@17']);
assert(issues[0].message.includes('admonition') && issues[1].message.includes('pymdownx.details') && issues[2].message.includes('def_list'));
issues = checkExtensions(page, { extensions: new Set(['admonition']) });
assert(issues[0].message.includes('dsfr_structure') && issues[0].range.line === 4);
assert.deepStrictEqual(checkExtensions(page, { extensions: new Set(['dsfr_structure.extension.all_extensions', 'admonition', 'pymdownx.details', 'attr_list', 'def_list']) }), []);

fs.rmSync(root, { recursive: true, force: true });
console.log('Liens, images, ancres et mkdocs.yml : OK');
