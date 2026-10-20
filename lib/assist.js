'use strict';
/**
 * Autocomplétion et aide au survol pour les blocs DSFR, indépendantes de VS Code
 * (extension.js les branche sur l'éditeur ; test/assist.js les teste avec Node).
 *
 *   /// al|              → noms de blocs
 *   /// alert | Titre
 *       ty|              → options du bloc (celles déjà écrites ne sont pas reproposées)
 *       type: wa|        → valeurs de l'option (listes fermées, booléens, pictogrammes, icônes)
 *
 * Dans l'en-tête YAML de la page, « type: » sous « notice: » propose les types de bandeau.
 * Le survol d'un nom de bloc ou d'une option affiche sa description et un lien vers la documentation.
 */
const { BLOCKS, NOTICE_TYPES, optionValues } = require('./options');
const catalog = require('./catalog');

const HEADER_RE = /^(\s*)(\/{3,})[ ]*([\w-]+)[ ]*(?:\|.*)?$/;
const indentOf = (s) => s.length - s.trimStart().length;

/**
 * Si la ligne `line` fait partie des options d'un bloc (lignes indentées de 4 espaces ou plus
 * sous « /// nom »), renvoie le bloc : { name, headerLine, keys (options déjà écrites) }.
 */
function headerContext(lines, line) {
  for (let l = line - 1; l >= 0 && lines[l].trim() !== ''; l--) {
    const m = HEADER_RE.exec(lines[l]);
    if (!m) continue;
    const name = m[3].toLowerCase();
    if (!BLOCKS[name]) return null;
    const min = m[1].length + 4;
    for (let k = l + 1; k <= line; k++) if (indentOf(lines[k]) < min && lines[k].trim() !== '') return null;
    if (indentOf(lines[line]) < min) return null;
    const keys = new Set();
    for (let k = l + 1; k < lines.length && lines[k].trim() !== '' && indentOf(lines[k]) >= min; k++) {
      const km = /^\s*([\w]+)\s*:/.exec(lines[k]);
      if (km && k !== line && indentOf(lines[k]) === min) keys.add(km[1]);
    }
    return { name, headerLine: l, indent: min, keys };
  }
  return null;
}

// Ligne dans l'en-tête YAML de la page ? Renvoie la clé de premier niveau qui la contient.
function frontMatterParent(lines, line) {
  if (!/^---\s*$/.test(lines[0] || '')) return null;
  let end = -1;
  for (let l = 1; l < lines.length; l++) if (/^(---|\.\.\.)\s*$/.test(lines[l])) { end = l; break; }
  if (end < 0 || line <= 0 || line >= end) return null;
  for (let l = line - 1; l > 0; l--) {
    const m = /^([\w-]+)\s*:/.exec(lines[l]);
    if (m) return m[1];
  }
  return null;
}

/**
 * @param {string[]} lines  lignes du document
 * @param {number} line
 * @param {number} character  position du curseur
 * @param {{artworkDir: string, cssFiles: string[]}} assets  fichiers du DSFR livrés avec l'extension
 * @returns {null|{from: number, items: Array<{label: string, kind: 'block'|'option'|'value',
 *           insertText: string, snippet?: boolean, detail?: string, documentation?: string, retrigger?: boolean}>}}
 */
function completions(lines, line, character, assets) {
  const text = (lines[line] || '').slice(0, character);

  // 1) Nom de bloc après « /// »
  let m = /^(\s*)(\/{3,})[ ]*([\w-]*)$/.exec(text);
  if (m && (m[3] || /\/{3,} $/.test(text))) {
    return {
      from: character - m[3].length,
      items: Object.keys(BLOCKS).map((name) => ({
        label: name,
        kind: 'block',
        detail: catalog.BLOCK_DOCS[name].label,
        documentation: catalog.blockDoc(name),
        insertText: BLOCKS[name].arg === true ? name + ' | ${1:Titre}' : name,
        snippet: BLOCKS[name].arg === true,
      })),
    };
  }

  // 2) Options d'un bloc
  const hc = headerContext(lines, line);
  if (hc) {
    m = /^\s+([\w]*)$/.exec(text);
    if (m) {
      const names = Object.keys(BLOCKS[hc.name].options).concat('attrs').filter((k) => !hc.keys.has(k));
      return {
        from: character - m[1].length,
        items: names.map((key) => ({
          label: key,
          kind: 'option',
          detail: 'Option de « ' + hc.name + ' »',
          documentation: catalog.optionDoc(hc.name, key),
          insertText: key === 'attrs' ? 'attrs: {class: ${1}}' : key + ': ',
          snippet: key === 'attrs',
          retrigger: key !== 'attrs' && valuesFor(hc.name, key, assets) !== null,
        })),
      };
    }
    m = /^\s+([\w]+)\s*:\s*([^\s]*)$/.exec(text);
    if (m) {
      const values = valuesFor(hc.name, m[1], assets);
      if (!values) return null;
      return { from: character - m[2].length, items: values.map((v) => ({ label: v, kind: 'value', insertText: v })) };
    }
    return null;
  }

  // 3) Type du bandeau dans l'en-tête de la page
  m = /^\s+type\s*:\s*([^\s]*)$/.exec(text);
  if (m && frontMatterParent(lines, line) === 'notice') {
    return { from: character - m[1].length, items: NOTICE_TYPES.map((v) => ({ label: v, kind: 'value', insertText: v })) };
  }
  return null;
}

function valuesFor(name, key, assets) {
  const values = optionValues(name, key);
  if (values) return values;
  if (key === 'picto' && assets) return catalog.pictograms(assets.artworkDir);
  if (key === 'icon' && assets) return catalog.iconNames(assets.cssFiles);
  return null;
}

/**
 * Aide au survol d'un nom de bloc (dans « /// nom ») ou d'une option.
 * @returns {null|{markdown: string, range: {line: number, start: number, end: number}}}
 */
function hover(lines, line, character) {
  const text = lines[line] || '';
  const m = /^(\s*)(\/{3,})[ ]*([\w-]+)/.exec(text);
  if (m) {
    const start = m[0].length - m[3].length;
    const name = m[3].toLowerCase();
    if (character >= start && character <= m[0].length && BLOCKS[name]) {
      return { markdown: catalog.blockDoc(name), range: { line, start, end: m[0].length } };
    }
    return null;
  }
  const hc = headerContext(lines, line);
  if (!hc) return null;
  const km = /^(\s*)([\w]+)\s*:/.exec(text);
  if (!km) return null;
  const start = km[1].length;
  const end = start + km[2].length;
  if (character < start || character > end) return null;
  const doc = catalog.optionDoc(hc.name, km[2]);
  if (!doc) return null;
  return {
    markdown: '**' + km[2] + '** — option de « ' + hc.name + ' »\n\n' + doc + '\n\n[Documentation du composant](' + catalog.docUrl(hc.name) + ')',
    range: { line, start, end },
  };
}

module.exports = { completions, hover, headerContext };
