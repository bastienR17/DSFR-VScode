'use strict';
/**
 * Couleurs DSFR des blocs « /// » dans l'éditeur, quel que soit le thème de VS Code :
 *   « /// »       rouge Marianne
 *   nom du bloc   bleu France, en gras
 *   titre         vert menthe
 *   options       nom de l'option en glycine
 *   + un léger fond bleu sur les lignes d'ouverture et de fermeture, pour voir d'un coup d'œil où
 *     commence et finit chaque bloc.
 *
 * Ce module calcule seulement les positions (module pur, testé par test/decorations.js) ;
 * extension.js applique les couleurs (réglage dsfrPreview.colors).
 */
const HEADER_RE = /^(\s{0,3})(\/{3,})([ \t]*)([A-Za-z][\w-]*)(?:([ \t]*)(\|)([ \t]*)(.*?))?[ \t]*$/;
const CLOSE_RE = /^(\s{0,3})(\/{3,})[ \t]*$/;
const OPTION_RE = /^(\s{4,})([A-Za-z_][\w-]*)[ \t]*:/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** Couleurs (clair / sombre), reprises de la palette du DSFR. */
const COLORS = {
  fence: { light: '#E1000F', dark: '#FF6F6F' },
  name: { light: '#000091', dark: '#8B8BFF' },
  title: { light: '#00796B', dark: '#3CC9B5' },
  key: { light: '#A558A0', dark: '#E8A3E3' },
  band: { light: 'rgba(106, 106, 244, 0.08)', dark: 'rgba(139, 139, 255, 0.12)' },
};

/**
 * @param {string[]} lines
 * @returns {{fence: Range[], name: Range[], title: Range[], key: Range[], band: number[]}}
 *   Range = {line, start, end} ; band : lignes d'ouverture et de fermeture
 */
function blockDecorations(lines) {
  const out = { fence: [], name: [], title: [], key: [], band: [] };
  let l = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    const end = lines.findIndex((t, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(t));
    if (end > 0) l = end + 1;
  }
  let fence = null;
  let inOptions = false;
  for (; l < lines.length; l++) {
    const t = (lines[l] || '').replace(/\r$/, '');
    const f = FENCE_RE.exec(t);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; inOptions = false; continue; }
    const h = HEADER_RE.exec(t);
    if (h) {
      let at = h[1].length;
      out.fence.push({ line: l, start: at, end: at + h[2].length });
      at += h[2].length + h[3].length;
      out.name.push({ line: l, start: at, end: at + h[4].length });
      if (h[6]) {
        at += h[4].length + h[5].length;
        out.fence.push({ line: l, start: at, end: at + 1 });
        at += 1 + h[7].length;
        if (h[8]) out.title.push({ line: l, start: at, end: at + h[8].length });
      }
      out.band.push(l);
      inOptions = true;
      continue;
    }
    const c = CLOSE_RE.exec(t);
    if (c) {
      out.fence.push({ line: l, start: c[1].length, end: c[1].length + c[2].length });
      out.band.push(l);
      inOptions = false;
      continue;
    }
    if (inOptions) {
      const o = OPTION_RE.exec(t);
      if (o) { out.key.push({ line: l, start: o[1].length, end: o[1].length + o[2].length }); continue; }
      inOptions = false;
    }
  }
  return out;
}

module.exports = { blockDecorations, COLORS };
