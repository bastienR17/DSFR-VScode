'use strict';
/**
 * Lecture facultative du mkdocs.yml du site, pour deux usages dans l'éditeur :
 *   - `docs_dir` : résoudre les liens absolus (« /guides/page.md ») vers les fichiers du site ;
 *   - `markdown_extensions` : signaler une syntaxe utilisée dans la page mais non activée sur le
 *     site (elle s'y afficherait en texte brut).
 * Sans mkdocs.yml, rien n'est signalé : l'extension fonctionne comme avant, sur n'importe quel fichier.
 *
 * Module pur : l'accès aux fichiers est fourni par l'appelant (test/links.js le simule).
 */
const path = require('path');
const yaml = require('./vendor/js-yaml.min.js');

const CONFIG_NAMES = ['mkdocs.yml', 'mkdocs.yaml'];

/**
 * Cherche le mkdocs.yml le plus proche en remontant depuis `dir`, sans dépasser `stopDir`.
 * @param {string} dir
 * @param {string|null} stopDir  racine du dossier ouvert dans VS Code (ou null)
 * @param {(p: string) => boolean} exists
 * @returns {string|null}
 */
function findConfig(dir, stopDir, exists) {
  let current = path.resolve(dir);
  const stop = stopDir ? path.resolve(stopDir) : null;
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(current, name);
      if (exists(candidate)) return candidate;
    }
    if (stop && current === stop) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Lit les réglages utiles d'un mkdocs.yml. Les balises propres à MkDocs (!ENV, !relative,
 * !!python/name:…) sont neutralisées : seules docs_dir et markdown_extensions sont lues.
 * @returns {{docsDir: string, siteUrl: string, extensions: Set<string>}|null}  null si le fichier est illisible
 */
function parseConfig(text, configPath) {
  let data;
  try {
    const cleaned = String(text).replace(/(^|[\s[,])!!?[\w/.:-]+/g, '$1');
    data = yaml.load(cleaned) || {};
  } catch (e) {
    return null;
  }
  if (typeof data !== 'object' || Array.isArray(data)) return null;
  const extensions = new Set();
  for (const item of Array.isArray(data.markdown_extensions) ? data.markdown_extensions : []) {
    if (typeof item === 'string') extensions.add(item);
    else if (item && typeof item === 'object') for (const k of Object.keys(item)) extensions.add(k);
  }
  const docsDir = typeof data.docs_dir === 'string' && data.docs_dir ? data.docs_dir : 'docs';
  const siteUrl = typeof data.site_url === 'string' ? data.site_url : '';
  return { docsDir: path.resolve(path.dirname(configPath), docsDir), siteUrl, extensions };
}

// Syntaxes du site et extension Python-Markdown qui les active.
const SYNTAXES = [
  {
    re: /^\s{0,3}\/{3,}[ ]*[\w-]+/,
    has: (ext) => [...ext].some((e) => e.startsWith('dsfr_structure')),
    message: 'Les blocs « /// » du thème ne sont pas activés dans le mkdocs.yml du site : ajoutez « dsfr_structure.extension.all_extensions » à markdown_extensions, sinon ils s\'afficheront en texte brut.',
  },
  {
    re: /^\s{0,3}!!![ ]?[\w-]/,
    has: (ext) => ext.has('admonition') || ext.has('markdown.extensions.admonition'),
    message: 'Les encadrés « !!! » nécessitent l\'extension « admonition » dans markdown_extensions du mkdocs.yml : sinon ils s\'afficheront en texte brut sur le site.',
  },
  {
    re: /^\s{0,3}\?\?\?\+?[ ]?[\w-]/,
    has: (ext) => ext.has('pymdownx.details'),
    message: 'Les encadrés repliables « ??? » nécessitent l\'extension « pymdownx.details » dans markdown_extensions du mkdocs.yml : sinon ils s\'afficheront en texte brut sur le site.',
  },
  {
    re: /\{:?[ ]*[#.][\w-][^}]*\}\s*$/,
    has: (ext) => ext.has('attr_list') || ext.has('markdown.extensions.attr_list'),
    message: 'Les attributs « { #id } » ou « {: .classe } » nécessitent l\'extension « attr_list » dans markdown_extensions du mkdocs.yml : sinon ils s\'afficheront tels quels sur le site.',
  },
  {
    re: /^:[ ]{1,3}\S/,
    previousNotBlank: true,
    has: (ext) => ext.has('def_list') || ext.has('markdown.extensions.def_list'),
    message: 'Les listes de définitions (« : définition ») nécessitent l\'extension « def_list » dans markdown_extensions du mkdocs.yml.',
  },
];

/**
 * Syntaxes utilisées dans la page mais non activées dans le mkdocs.yml : un problème par syntaxe,
 * à sa première utilisation (hors en-tête YAML et blocs de code).
 * @param {string} text
 * @param {{extensions: Set<string>}} config
 */
function checkExtensions(text, config) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const issues = [];
  const done = new Set();
  let start = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) start = end + 1;
  }
  let fence = null;
  for (let l = start; l < lines.length; l++) {
    const t = lines[l];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(t);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    SYNTAXES.forEach((s, i) => {
      if (done.has(i) || !s.re.test(t) || s.has(config.extensions)) return;
      if (s.previousNotBlank && !(lines[l - 1] || '').trim()) return;
      done.add(i);
      const startCol = t.length - t.trimStart().length;
      issues.push({ code: 'dsfr-mkdocs-extension', severity: 'warning', message: s.message, range: { line: l, start: startCol, end: t.length }, fixes: [] });
    });
  }
  return issues;
}

module.exports = { findConfig, parseConfig, checkExtensions };
