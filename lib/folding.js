'use strict';
/**
 * Repli des blocs DSFR dans l'éditeur : chaque « /// nom » se replie jusqu'à son « /// » de fermeture
 * (flèche dans la marge, ou Ctrl+Maj+[). Les blocs imbriqués (onglets, grilles…) se replient chacun.
 * Les blocs de code et l'en-tête YAML sont ignorés ; un bloc jamais fermé n'est pas repliable.
 *
 * Module pur, testé par test/folding.js.
 */
const HEADER_RE = /^\s{0,3}\/{3,}[ \t]*[A-Za-z][\w-]*/;
const CLOSE_RE = /^\s{0,3}\/{3,}[ \t]*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * @param {string[]} lines
 * @returns {{start: number, end: number}[]}  lignes de l'en-tête et de la fermeture
 */
function foldingRanges(lines) {
  const ranges = [];
  const stack = [];
  let l = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    const end = lines.findIndex((t, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(t));
    if (end > 0) l = end + 1;
  }
  let fence = null;
  for (; l < lines.length; l++) {
    const t = (lines[l] || '').replace(/\r$/, '');
    const f = FENCE_RE.exec(t);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !t.slice(t.indexOf(f[1]) + f[1].length).trim()) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    if (HEADER_RE.test(t)) stack.push(l);
    else if (CLOSE_RE.test(t) && stack.length) {
      const start = stack.pop();
      if (l > start) ranges.push({ start, end: l });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

module.exports = { foldingRanges };
