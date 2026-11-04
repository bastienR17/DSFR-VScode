'use strict';
/**
 * Barre de mise en forme (boutons en haut de l'éditeur, comme dans Word) : gras, italique, titre, listes
 * à puces ou numérotées, lien. Chaque bouton ajoute la mise en forme, ou l'enlève si elle y est déjà.
 *
 * Les fonctions travaillent sur le texte de la page et des positions en caractères (module pur, testé
 * par test/format.js) ; extension.js applique le résultat dans l'éditeur.
 */

const WORD = /[\p{L}\p{N}_'’-]/u;

/**
 * Gras (« ** ») ou italique (« * ») sur la sélection [start, end) du texte `doc`.
 * Sans sélection : le mot sous le curseur ; hors d'un mot : les marques sont insérées, curseur au milieu.
 * Les espaces sélectionnés aux bords restent hors des marques (« **mot** » et non « **mot ** »).
 * @returns {{start: number, end: number, text: string, select: [number, number]}}
 *   remplacer [start, end) par text ; select : nouvelle sélection (positions dans le texte modifié)
 */
function toggleInline(doc, start, end, kind) {
  const mark = kind === 'bold' ? '**' : '*';
  if (start === end) {
    let a = start;
    let b = end;
    while (a > 0 && WORD.test(doc[a - 1])) a--;
    while (b < doc.length && WORD.test(doc[b])) b++;
    if (a === b) return { start, end, text: mark + mark, select: [start + mark.length, start + mark.length] };
    start = a;
    end = b;
  }
  // Espaces aux bords : hors des marques
  while (start < end && /\s/.test(doc[start])) start++;
  while (end > start && /\s/.test(doc[end - 1])) end--;
  const sel = doc.slice(start, end);
  const stars = (x) => /^\**/.exec(x)[0].length;
  const endStars = (x) => /\**$/.exec(x)[0].length;
  // gras : « **x** » ou « ***x*** » ; italique : « *x* » ou « ***x*** »
  const has = (x) => x.length > 2 * mark.length && Math.min(stars(x), endStars(x)) >= mark.length &&
    (kind === 'bold' ? Math.min(stars(x), endStars(x)) !== 1 : Math.min(stars(x), endStars(x)) !== 2);
  // Sélection déjà entourée des marques (dedans ou juste autour) : on les retire
  if (has(sel)) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return { start, end, text: inner, select: [start, start + inner.length] };
  }
  const before = doc.slice(Math.max(0, start - mark.length), start);
  const after = doc.slice(end, end + mark.length);
  const starsBefore = /\**$/.exec(doc.slice(0, start))[0].length;
  const starsAfter = /^\**/.exec(doc.slice(end))[0].length;
  const around = Math.min(starsBefore, starsAfter);
  const aroundOk = before === mark && after === mark && (kind === 'bold' ? around !== 1 : around !== 2);
  if (aroundOk) {
    return { start: start - mark.length, end: end + mark.length, text: sel, select: [start - mark.length, start - mark.length + sel.length] };
  }
  // Plusieurs lignes : chaque ligne non vide est mise en forme (les « ** » ne traversent pas les paragraphes)
  const text = sel.split('\n').map((l) => {
    const m = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)?)(.*?)(\s*)$/.exec(l);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : l;
  }).join('\n');
  // Une seule ligne : le mot reste sélectionné (sans les marques), un second clic retire la mise en forme
  const single = !sel.includes('\n') && text !== sel;
  return { start, end, text, select: single ? [start + mark.length, start + text.length - mark.length] : [start, start + text.length] };
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+/;
const HEADING_RE = /^(\s{0,3})#{1,6}(\s+|$)/;

/**
 * Titre sur les lignes [from, to] : level 2 à 4 (« ## »…), 0 = texte normal.
 * @returns {{from: number, to: number, lines: string[]}}  lignes de remplacement
 */
function setHeading(lines, from, to, level) {
  const out = [];
  for (let i = from; i <= to; i++) {
    const l = lines[i];
    const bare = l.replace(HEADING_RE, '$1').replace(LIST_RE, '$1').replace(/^\s+/, '');
    out.push(!bare.trim() ? l : level ? '#'.repeat(level) + ' ' + bare.replace(/^\*\*(.*)\*\*$/, '$1') : bare);
  }
  return { from, to, lines: out };
}

/**
 * Liste à puces (« - ») ou numérotée (« 1. ») sur les lignes [from, to] : ajoutée, ou retirée si toutes
 * les lignes sont déjà de ce type. Une ligne vide est ajoutée avant la liste si la ligne précédente est
 * un paragraphe (sinon le site ne l'affiche pas comme une liste).
 * @returns {{from: number, to: number, lines: string[]}}
 */
function toggleList(lines, from, to, kind) {
  const ordered = kind === 'numbered';
  const range = [];
  for (let i = from; i <= to; i++) range.push(lines[i]);
  const filled = range.filter((l) => l.trim());
  const isKind = (l) => { const m = LIST_RE.exec(l); return m && (/\d/.test(m[2]) === ordered); };
  const remove = filled.length > 0 && filled.every(isKind);
  let n = 0;
  const out = range.map((l) => {
    if (!l.trim()) return l;
    const m = LIST_RE.exec(l);
    const indent = m ? m[1] : /^\s*/.exec(l)[0];
    const body = m ? l.slice(m[0].length) : l.replace(HEADING_RE, '').trimStart();
    if (remove) return indent + body;
    return indent + (ordered ? (++n) + '. ' : '- ') + body;
  });
  const prev = lines[from - 1];
  if (!remove && from > 0 && prev && prev.trim() && !LIST_RE.test(prev)) out.unshift(''); // ligne vide avant la liste
  return { from, to, lines: out };
}

/**
 * Lien : [texte](adresse). Le texte est la sélection (ou « texte du lien »).
 * @returns {{text: string, snippet: string}}  snippet VS Code (le texte du lien est sélectionné s'il est vide)
 */
function linkSnippet(selected, url) {
  const esc = (s) => s.replace(/[$}\\]/g, '\\$&');
  const label = String(selected || '').trim();
  const href = String(url || '').trim().replace(/ /g, '%20');
  return label ? '[' + esc(label.replace(/\]/g, '\\]')) + '](' + esc(href) + ')$0' : '[${1:texte du lien}](' + esc(href) + ')$0';
}

const looksLikeUrl = (s) => /^(https?:\/\/|mailto:|\.{0,2}\/|[\w-]+\.md\b)/i.test(String(s || '').trim());

module.exports = { toggleInline, setHeading, toggleList, linkSnippet, looksLikeUrl };
