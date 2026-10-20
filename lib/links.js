'use strict';
/**
 * Liens et images de la page ouverte : fichiers introuvables et ancres inexistantes.
 *
 * Vérifié (comme MkDocs le fait à la construction du site) :
 *   - liens vers une page .md, relatifs au fichier, ou absolus (« /guides/page.md ») si le
 *     mkdocs.yml du site donne le dossier des pages (docs_dir) ;
 *   - images et fichiers liés (.png, .pdf…), et adresses locales des options des blocs
 *     (image, poster, captions, url, target) ;
 *   - ancres « #titre » vers un titre de la page ou d'une autre page.
 * Non vérifié : adresses web (https:…), liens vers un dossier (« ../guides/ »).
 *
 * Les ancres sont comparées aux identifiants que MkDocs peut produire pour chaque titre
 * (règle par défaut, ou règle Unicode de pymdownx) et aux identifiants écrits à la main
 * ({ #id }, id="…") : une ancre n'est signalée que si elle ne correspond à aucun d'eux.
 *
 * Module pur : l'accès aux fichiers est fourni par l'appelant.
 */
const path = require('path');
const MarkdownIt = require('./vendor/markdown-it.min.js');
const { frontMatterRule } = require('./lint');

const md = new MarkdownIt({ html: true });
md.block.ruler.before('table', 'dsfr_front_matter', frontMatterRule);

// Options des blocs qui contiennent une adresse de fichier
const FILE_OPTIONS = /^(\s+)(image|poster|captions|url|target)(\s*:\s*)(['"]?)([^'"\s#?][^'"\s]*)\4\s*$/;
const HEADER_RE = /^\s*\/{3,}[ ]*[\w-]+/;

/* --- Identifiants des titres, comme MkDocs ------------------------------------------- */

// toc.slugify de Python-Markdown (règle par défaut de MkDocs) : accents retirés.
function slugAscii(text) {
  return text.normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
    .replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[-\s]+/g, '-');
}
// Variante Unicode (toc.slugify_unicode, pymdownx.slugs) : accents conservés.
function slugUnicode(text) {
  return text.normalize('NFC').replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().toLowerCase().replace(/[-\s]+/g, '-');
}

/** Ancres disponibles dans un texte Markdown. */
function anchorsOf(text) {
  const anchors = new Set();
  const counts = new Map();
  const add = (slug) => {
    if (!slug) return;
    // Titres identiques : MkDocs ajoute _1, _2… au deuxième, au troisième…
    const n = counts.get(slug) || 0;
    counts.set(slug, n + 1);
    anchors.add(n ? slug + '_' + n : slug);
  };
  let tokens = [];
  try { tokens = md.parse(text, {}); } catch (e) { /* page illisible : aucune ancre connue */ }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    const raw = (inline.children || []).filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');
    const attr = /\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(raw);
    if (attr) { anchors.add(attr[1]); continue; }
    const title = raw.replace(/\s*\{[^}]*\}\s*$/, '');
    add(slugAscii(title));
    if (slugUnicode(title) !== slugAscii(title)) add(slugUnicode(title));
  }
  const re = /\{[^}\n]*#([\w-]+)[^}\n]*\}|\b(?:id|name)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) anchors.add(m[1] || m[2]);
  return anchors;
}

/* --- Vérification ---------------------------------------------------------------------- */

const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
const safeDecode = (s) => { try { return decodeURI(s); } catch (e) { return s; } };

/**
 * @param {string} text  contenu de la page
 * @param {object} ctx
 * @param {string} ctx.file  chemin du fichier de la page
 * @param {string|null} ctx.docsDir  dossier des pages du site (docs_dir), ou null sans mkdocs.yml
 * @param {(p: string) => boolean} ctx.exists
 * @param {(p: string) => string|null} ctx.read  contenu d'une autre page (null si illisible)
 * @returns {import('./lint').Issue[]}
 */
function checkLinks(text, ctx) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const issues = [];
  const seen = new Set();
  let ownAnchors = null;
  const anchorCache = new Map();

  // Position d'une adresse dans le texte, entre les lignes `from` et `to`.
  function locate(href, from, to) {
    for (let l = from; l < Math.min(to, lines.length); l++) {
      const c = lines[l].indexOf(href);
      if (c >= 0) return { line: l, start: c, end: c + href.length };
    }
    for (let l = 0; l < lines.length; l++) { // lien de référence défini ailleurs : [texte][ref]
      const c = lines[l].indexOf(href);
      if (c >= 0) return { line: l, start: c, end: c + href.length };
    }
    return { line: from, start: 0, end: (lines[from] || '').length };
  }

  function push(code, message, range) {
    const key = code + '|' + range.line + '|' + range.start;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, severity: 'warning', message, range, fixes: [] });
  }

  function check(href, range, kind) {
    if (!href || isExternal(href)) return;
    const hash = href.indexOf('#');
    const target = safeDecode((hash >= 0 ? href.slice(0, hash) : href).split('?')[0]);
    const anchor = hash >= 0 ? safeDecode(href.slice(hash + 1)) : '';

    if (!target) {
      if (!anchor) return;
      if (!ownAnchors) ownAnchors = anchorsOf(text);
      if (!ownAnchors.has(anchor)) push('dsfr-anchor-missing', 'Ancre « #' + anchor + ' » introuvable dans cette page : aucun titre ne lui correspond.', range);
      return;
    }
    const isPage = /\.md$/i.test(target);
    // Liens vers un dossier ou une adresse du site (« ../guides/ ») : non vérifiés.
    if (!isPage && !/\.[a-z0-9]{1,5}$/i.test(target)) return;
    let full;
    if (target.startsWith('/')) {
      if (!ctx.docsDir) return; // sans mkdocs.yml, on ne sait pas où est la racine du site
      full = path.join(ctx.docsDir, target);
    } else {
      full = path.resolve(path.dirname(ctx.file), target);
    }
    if (!ctx.exists(full)) {
      const what = isPage ? 'Page' : (kind === 'image' ? 'Image' : 'Fichier');
      push(isPage ? 'dsfr-link-missing' : 'dsfr-file-missing', what + ' « ' + target + ' » introuvable : le lien sera cassé sur le site.', range);
      return;
    }
    if (isPage && anchor) {
      if (!anchorCache.has(full)) {
        const other = ctx.read(full);
        anchorCache.set(full, other === null ? null : anchorsOf(other));
      }
      const set = anchorCache.get(full);
      if (set && !set.has(anchor)) push('dsfr-anchor-missing', 'Ancre « #' + anchor + ' » introuvable dans « ' + target + ' » : aucun titre ne lui correspond.', range);
    }
  }

  // 1) Liens et images Markdown
  let tokens = [];
  try { tokens = md.parse(text, {}); } catch (e) { return issues; }
  for (const t of tokens) {
    if (t.type !== 'inline' || !t.children || !t.map) continue;
    for (const c of t.children) {
      if (c.type === 'link_open') {
        const href = c.attrGet('href');
        // markdown-it encode l'adresse : on cherche aussi sa forme écrite
        const raw = rawHref(href, lines, t.map);
        check(raw, locate(raw, t.map[0], t.map[1]), 'link');
      } else if (c.type === 'image') {
        const src = c.attrGet('src');
        const raw = rawHref(src, lines, t.map);
        check(raw, locate(raw, t.map[0], t.map[1]), 'image');
      }
    }
  }

  // 2) Adresses dans les options des blocs « /// » (image:, poster:, target:…)
  let inHeader = false;
  let fence = null;
  for (let l = 0; l < lines.length; l++) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[l]);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; inHeader = false; continue; }
    if (HEADER_RE.test(lines[l])) { inHeader = true; continue; }
    if (!inHeader) continue;
    const m = FILE_OPTIONS.exec(lines[l]);
    if (!m) { if (!/^\s{4,}\S/.test(lines[l])) inHeader = false; continue; }
    const start = m[1].length + m[2].length + m[3].length + m[4].length;
    check(m[5], { line: l, start, end: start + m[5].length }, m[2] === 'target' ? 'link' : 'image');
  }
  return issues.sort((a, b) => a.range.line - b.range.line || a.range.start - b.range.start);
}

// Retrouve l'adresse telle qu'elle est écrite (markdown-it encode les espaces, accents…).
function rawHref(href, lines, map) {
  if (!href) return href;
  const decoded = safeDecode(href);
  for (let l = map[0]; l < Math.min(map[1], lines.length); l++) {
    if (lines[l].includes(href)) return href;
    if (lines[l].includes(decoded)) return decoded;
  }
  return decoded;
}

module.exports = { checkLinks, anchorsOf, slugAscii, slugUnicode };
