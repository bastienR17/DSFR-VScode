'use strict';
/**
 * Collage depuis Word, Excel, Google Docs ou une page web : le HTML du presse-papiers devient du Markdown
 * propre pour Doc SIRH.
 *   - titres, paragraphes (séparés par une ligne vide), gras et italique (sans espace collé aux « ** »)
 *   - listes à puces et numérotées, y compris les listes de Word (paragraphes « mso-list »), sous-listes
 *     indentées de 4 espaces comme le veut MkDocs
 *   - tableaux (première ligne en en-tête, cellules fusionnées complétées), liens
 *   - le texte copié depuis Excel en simple texte (colonnes séparées par des tabulations) devient un tableau
 * Les images de Word ne peuvent pas être reprises (elles sont sur l'ordinateur) : chacune devient une image
 * dont l'adresse est préremplie jusqu'au répertoire des images (…/fichiers/), nom du fichier à compléter.
 *
 * Module pur, sans dépendance (testé par test/html-to-markdown.js).
 */

const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'wbr', 'area', 'base', 'source']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'td', 'th', 'blockquote', 'pre', 'hr', 'section', 'article', 'body', 'html', 'center', 'dl', 'dt', 'dd', 'header', 'footer',
  'main', 'nav', 'aside', 'figure', 'figcaption', 'caption', 'address']);
// Ouvrir l'une de ces balises ferme la précédente restée ouverte (HTML mal fermé de Word)
const AUTO_CLOSE = { p: ['p'], li: ['li', 'p'], tr: ['tr', 'td', 'th', 'p'], td: ['td', 'th', 'p'], th: ['td', 'th', 'p'], dt: ['dt', 'dd'], dd: ['dt', 'dd'] };
// … sans remonter au-delà de ces conteneurs
const SCOPE = new Set(['table', 'ul', 'ol', 'td', 'th', 'li', 'blockquote', 'body', 'div']);

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»', euro: '€', deg: '°', bull: '•', middot: '·', copy: '©', reg: '®', shy: '',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô',
  ugrave: 'ù', ucirc: 'û', uuml: 'ü', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', oelig: 'œ', OElig: 'Œ', times: '×',
};
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  }
  return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
});

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=/>"']+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  let m;
  while ((m = re.exec(src))) {
    let v = m[2] || '';
    if (/^["']/.test(v)) v = v.slice(1, -1);
    attrs[m[1].toLowerCase()] = decode(v);
  }
  return attrs;
}

/** Petit analyseur HTML tolérant → arbre {tag, attrs, children} / {text}. */
function parse(html) {
  let src = String(html)
    // forme « commentaire » des blocs de Word (<!--[if !supportLists]-->…<!--[endif]-->)
    .replace(/<!--\[if ([^\]]*)\]-->/gi, '<![if $1]>').replace(/<!--\[endif\]-->/gi, '<![endif]>')
    .replace(/<!--\[if [^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '') // blocs réservés à Word (masqués ailleurs)
    // numéro ou puce d'une liste de Word (« 1. », « · »…) ; les autres blocs <![if …]> (image de
    // remplacement de Word : <![if !vml]><img …><![endif]>) sont gardés tels quels
    .replace(/<!\[if !supportLists\]>([\s\S]*?)<!\[endif\]>/gi, '<dsfr-word-marker>$1</dsfr-word-marker>')
    .replace(/<!\[if [^\]]*\]>|<!\[endif\]>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head|title|xml|o:smarttagtype)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*>/gi, '');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m;
  const text = (t) => { if (t) top().children.push({ text: decode(t) }); };
  while ((m = re.exec(src))) {
    text(src.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (m[1]) { // fermeture : on remonte jusqu'à la balise ouverte correspondante
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
        if (SCOPE.has(stack[i].tag) && SCOPE.has(tag) && stack[i].tag !== tag && tag !== 'div') break;
      }
      continue;
    }
    if (AUTO_CLOSE[tag]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (AUTO_CLOSE[tag].includes(stack[i].tag)) { stack.length = i; break; }
        if (SCOPE.has(stack[i].tag)) break;
      }
    }
    const node = { tag, attrs: parseAttrs(m[3]), children: [] };
    top().children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node);
  }
  text(src.slice(last));
  return root;
}

/* ------------------------------------------------------------------ */
/* Texte en ligne : suites de « morceaux » {text, bold, italic, code}    */
/* ------------------------------------------------------------------ */

function styleOf(node, fmt) {
  const f = { ...fmt };
  const t = node.tag;
  if (t === 'b' || t === 'strong') f.bold = true;
  if (t === 'i' || t === 'em' || t === 'cite') f.italic = true;
  if (t === 'code' || t === 'kbd' || t === 'tt' || t === 'samp') f.code = true;
  const style = (node.attrs.style || '').toLowerCase();
  const w = /font-weight\s*:\s*([a-z0-9]+)/.exec(style);
  if (w) f.bold = w[1] === 'bold' || w[1] === 'bolder' || Number(w[1]) >= 600;
  const s = /font-style\s*:\s*([a-z]+)/.exec(style);
  if (s) f.italic = s[1] === 'italic' || s[1] === 'oblique';
  return f;
}

const hidden = (node) => /display\s*:\s*none|mso-hide\s*:\s*all/i.test(node.attrs.style || '');
// Numéro ou puce d'une liste de Word (« 1. », « · ») : déjà rendu par la liste Markdown
const isWordMarker = (node) => node.tag === 'dsfr-word-marker' || /mso-list\s*:\s*ignore/i.test(node.attrs.style || '');

/** Morceaux de texte d'un nœud (sans les blocs : appelé sur un contenu en ligne). */
function runs(node, fmt, out, ctx) {
  for (const c of node.children) {
    if (c.text !== undefined) { out.push({ text: c.text, ...fmt }); continue; }
    if (hidden(c) || isWordMarker(c)) continue;
    if (c.tag === 'br') { out.push({ br: true }); continue; }
    if (c.tag === 'img') { ctx.images++; out.push({ img: true, alt: altOf(c.attrs.alt || c.attrs.title) }); continue; }
    if (c.tag === 'v:imagedata') continue; // image VML de Word : doublon de l'<img> qui suit
    if (c.tag === 'v:shape') { runs(c, fmt, out, ctx); continue; }
    if (c.tag === 'a' && c.attrs.href && !/^(#|javascript:)/i.test(c.attrs.href) && !/^file:/i.test(c.attrs.href)) {
      const inner = [];
      runs(c, styleOf(c, fmt), inner, ctx);
      const label = inline(inner).trim();
      if (label) out.push({ link: c.attrs.href.trim(), label, ...fmt });
      continue;
    }
    if (BLOCK.has(c.tag)) { out.push({ br: true }); runs(c, styleOf(c, fmt), out, ctx); out.push({ br: true }); continue; }
    runs(c, styleOf(c, fmt), out, ctx);
  }
  return out;
}

const escapeText = (s) => s.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/`/g, '\\`').replace(/</g, '&lt;')
  .replace(/(^|[\s(])_(?=\S)|(?<=\S)_(?=[\s.,;:!?)]|$)/g, (m) => m.replace('_', '\\_'));

/** Morceaux → Markdown en ligne : espaces ramenés à un seul, et jamais collés à l'intérieur des « ** ». */
function inline(list, { br = '<br>' } = {}) {
  // fusion des morceaux voisins de même mise en forme
  const merged = [];
  for (const r of list) {
    const prev = merged[merged.length - 1];
    if (r.text !== undefined && prev && prev.text !== undefined && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.code === !!r.code) {
      prev.text += r.text;
    } else merged.push({ ...r });
  }
  let out = '';
  for (const r of merged) {
    if (r.br) { out += '\u0000'; continue; }
    if (r.img) { out += '![' + escapeText(r.alt || IMAGE_ALT).replace(/[[\]]/g, '\\$&') + '](' + IMAGE_BASE_MARK + NAME_MARK + ')'; continue; }
    if (r.link) {
      let label = r.label.replace(/\]/g, '\\]');
      out += '[' + label + '](' + r.link.replace(/ /g, '%20').replace(/\)/g, '%29') + ')';
      continue;
    }
    const text = r.text.replace(/[\s\u00a0\u200b]+/g, ' ');
    if (!text.trim() || !(r.bold || r.italic || r.code)) { out += r.code ? text : escapeText(text); continue; }
    const lead = /^ /.test(text) ? ' ' : '';
    const tail = / $/.test(text) && text.length > 1 ? ' ' : '';
    const core = text.trim();
    if (r.code) { out += lead + '`' + core.replace(/`/g, "'") + '`' + tail; continue; }
    const mark = r.bold && r.italic ? '***' : r.bold ? '**' : '*';
    out += lead + mark + escapeText(core) + mark + tail;
  }
  // sauts de ligne : supprimés en début et fin, un seul à la suite
  return out.replace(/ *\u0000 */g, '\u0000').replace(/\u0000+/g, '\u0000').replace(/^\u0000|\u0000$/g, '')
    .replace(/ {2,}/g, ' ').replace(/\u0000/g, br);
}

/* ------------------------------------------------------------------ */
/* Blocs                                                              */
/* ------------------------------------------------------------------ */

const textOf = (node) => (node.text !== undefined ? node.text : node.children.map(textOf).join(''));

// Paragraphe de liste de Word : « mso-list: l0 level2 lfo1 », marqueur dans <![if !supportLists]>
const ORDERED_MARK = /^(\(?\d+[.)]|\(?[a-zA-Z][.)]|[ivxlcdm]+[.)])$/i;
// Puce ou numéro écrits en tête du texte (HTML de Word réécrit par un navigateur : sans « mso-list »)
const LEADING_MARK = /^[\s\u00a0]*([·•o§▪■◦➢➤✓\-–]|\(?\d+[.)]|\(?[a-zA-Z][.)]|[ivxlcdm]+[.)])[\s\u00a0]+/i;

function wordListInfo(node) {
  const style = node.attrs.style || '';
  const m = /mso-list\s*:\s*l(\d+)\s+level(\d+)/i.exec(style);
  if (!m && /\bMsoListParagraph/i.test(node.attrs.class || '')) {
    const lead = LEADING_MARK.exec(textOf(node));
    if (!lead) return null; // paragraphe simplement en retrait
    const mark = lead[1];
    const margin = /margin-left\s*:\s*([\d.]+)pt/i.exec(style);
    // niveau : d'après le retrait s'il est connu, sinon d'après les puces par défaut de Word (·, o, §)
    const level = margin ? Math.max(1, Math.round(Number(margin[1]) / 36)) :
      mark === 'o' || /^\(?[a-z][.)]$/.test(mark) ? 2 : /^[§▪■]$/.test(mark) || /^[ivx]+[.)]$/.test(mark) && mark.length > 2 ? 3 : 1;
    return { list: 'x', level, ordered: ORDERED_MARK.test(mark), lead: true };
  }
  if (!m || /mso-list\s*:\s*ignore/i.test(style)) return null;
  const find = (n) => (n.tag && isWordMarker(n) ? n : (n.children || []).reduce((f, c) => f || find(c), null));
  const marker = find(node);
  const mark = (marker ? textOf(marker) : '').replace(/[\s\u00a0]+/g, ' ').trim();
  return { list: m[1], level: Number(m[2]), ordered: ORDERED_MARK.test(mark) };
}

const headingLevel = (node) => {
  const h = /^h([1-6])$/.exec(node.tag);
  if (h) return Number(h[1]);
  const cls = node.attrs.class || '';
  if (/\bMsoTitle\b/i.test(cls)) return 1;
  const m = /\bMsoHeading([1-6])\b/i.exec(cls);
  return m ? Number(m[1]) : 0;
};

// Image de Word (sur l'ordinateur, impossible à reprendre) : un repère invisible sur le site
// remplacée par une image dont l'adresse est préremplie jusqu'au répertoire des images (comme le
// composant « Image », dsfr-img) : il reste à écrire le nom du fichier déposé
const IMAGE_ALT = 'Description de l\'image';
const IMAGE_BASE_MARK = '\u0002';
const NAME_MARK = '\u0001';
const DEFAULT_IMAGE_BASE = 'https://docsirh.e2.rie.gouv.fr/fichiers/';
// Texte alternatif de Word : sa description automatique (« … Description générée automatiquement ») est retirée
const altOf = (alt) => String(alt || '').replace(/\s*Description générée automatiquement\.?\s*$/i, '').replace(/^Une image contenant .*$/i, '').replace(/\s+/g, ' ').trim();

const LIST_START = /^([-*+]|\d+[.)]) /;
const LIST_BREAK = '<!-- -->';

const hasBlock = (n) => (n.children || []).some((k) => k.tag && (BLOCK.has(k.tag) || hasBlock(k)));

/** Convertit l'arbre en blocs Markdown (tableau de chaînes, séparées ensuite par une ligne vide). */
function blocks(node, ctx, out = []) {
  let pending = [];
  const flush = () => {
    const md = inline(pending, { br: '  \n' }).trim();
    if (md) out.push(escapeBlockStart(md));
    pending = [];
  };
  const kids = node.children;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    // Élément en ligne qui contient des blocs (Google Docs enveloppe toute la page dans un <b>) : conteneur
    if (c.text === undefined && !BLOCK.has(c.tag) && !hidden(c) && hasBlock(c)) { flush(); blocks(c, ctx, out); continue; }
    if (c.text !== undefined || !BLOCK.has(c.tag)) {
      if (c.text === undefined && c.tag === 'img') { ctx.images++; pending.push({ img: true, alt: altOf(c.attrs.alt || c.attrs.title) }); continue; }
      if (c.text === undefined && c.tag === 'v:imagedata') continue;
      if (c.text === undefined && hidden(c)) continue;
      if (c.text !== undefined) pending.push({ text: c.text });
      else if (c.tag === 'br') pending.push({ br: true });
      else runs({ children: [c] }, {}, pending, ctx);
      continue;
    }
    flush();
    if (hidden(c)) continue;
    // Listes de Word : paragraphes consécutifs « mso-list »
    const info = c.tag === 'p' || c.tag === 'h1' || c.tag === 'h2' || c.tag === 'h3' ? wordListInfo(c) : null;
    if (info) {
      const items = [];
      let j = i;
      for (; j < kids.length; j++) {
        const k = kids[j];
        if (k.text !== undefined) { if (k.text.trim()) break; continue; }
        const inf = BLOCK.has(k.tag) ? wordListInfo(k) : null;
        if (!inf) break;
        let itemMd = inline(runs(k, {}, [], ctx)).trim();
        if (inf.lead) itemMd = itemMd.replace(LEADING_MARK, ''); // puce écrite dans le texte : retirée
        items.push({ ...inf, md: itemMd });
      }
      i = j - 1;
      out.push(listFromLevels(items));
      continue;
    }
    const level = headingLevel(c);
    if (level) {
      const md = inline(runs(c, { bold: false }, [], ctx).map((r) => ({ ...r, bold: false })), { br: ' ' }).trim();
      if (md) out.push('#'.repeat(level) + ' ' + md);
      continue;
    }
    switch (c.tag) {
      case 'ul': case 'ol': out.push(htmlList(c, ctx, 0)); break;
      case 'table': { const t = table(c, ctx); if (t) out.push(t); break; }
      case 'hr': out.push('---'); break;
      case 'pre': out.push('```\n' + textOf(c).replace(/\n$/, '') + '\n```'); break;
      case 'blockquote': {
        const inner = blocks(c, ctx, []);
        if (inner.length) out.push(inner.join('\n\n').split('\n').map((l) => (l ? '> ' + l : '>')).join('\n'));
        break;
      }
      case 'li': out.push(htmlList({ tag: 'ul', attrs: {}, children: [c] }, ctx, 0)); break;
      case 'tr': case 'td': case 'th': case 'thead': case 'tbody': {
        const t = table({ tag: 'table', attrs: {}, children: [c] }, ctx);
        if (t) out.push(t);
        break;
      }
      default: blocks(c, ctx, out);
    }
  }
  flush();
  return out;
}

// Une ligne qui commencerait comme un titre, une liste ou une citation sans en être une
const escapeBlockStart = (md) => md.split('\n').map((l) => l.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/, (m, sp, x) => sp + '\\' + x)).join('\n');

function listFromLevels(items) {
  const min = Math.min(...items.map((i) => i.level));
  const counters = [];
  return items.map((it) => {
    const depth = Math.max(0, it.level - min);
    counters.length = depth + 1;
    counters[depth] = (counters[depth] || 0) + 1;
    const marker = it.ordered ? counters[depth] + '.' : '-';
    return '    '.repeat(depth) + marker + ' ' + (it.md || '').replace(/<br>/g, '  \n' + '    '.repeat(depth + 1));
  }).join('\n');
}

function htmlList(list, ctx, depth) {
  const ordered = list.tag === 'ol';
  let n = Number(list.attrs.start) > 0 ? Number(list.attrs.start) : 1;
  const lines = [];
  for (const li of list.children) {
    if (li.text !== undefined) continue;
    if (li.tag === 'ul' || li.tag === 'ol') { lines.push(htmlList(li, ctx, depth + 1)); continue; } // liste mal imbriquée (Google Docs)
    if (li.tag !== 'li') continue;
    const own = { ...li, children: li.children.filter((k) => !(k.tag === 'ul' || k.tag === 'ol')) };
    const text = inline(runs(own, {}, [], ctx), { br: '  \n' + '    '.repeat(depth + 1) }).trim();
    lines.push('    '.repeat(depth) + (ordered ? (n++) + '.' : '-') + ' ' + text);
    for (const k of li.children) if (k.tag === 'ul' || k.tag === 'ol') lines.push(htmlList(k, ctx, depth + 1));
  }
  return lines.join('\n');
}

function table(node, ctx) {
  const rows = [];
  const collect = (n) => {
    for (const c of n.children) {
      if (c.text !== undefined) continue;
      if (c.tag === 'tr') rows.push(c);
      else if (c.tag !== 'table') collect(c); // tableau dans un tableau : ignoré
    }
  };
  collect(node);
  const grid = [];
  const spans = []; // fusions verticales en attente, par colonne
  rows.forEach((tr, r) => {
    const row = [];
    let col = 0;
    const take = () => { while (spans[col] && spans[col] > 0) { row[col] = ''; spans[col]--; col++; } };
    for (const td of tr.children) {
      if (td.text !== undefined || (td.tag !== 'td' && td.tag !== 'th')) continue;
      take();
      const cell = inline(runs(td, td.tag === 'th' && r === 0 ? {} : {}, [], ctx)).trim().replace(/\|/g, '\\|');
      const cs = Math.max(1, Math.min(50, Number(td.attrs.colspan) || 1));
      const rs = Math.max(1, Math.min(500, Number(td.attrs.rowspan) || 1));
      for (let k = 0; k < cs; k++) {
        row[col] = k ? '' : cell;
        if (rs > 1) spans[col] = rs - 1;
        col++;
      }
    }
    take();
    if (row.length) grid.push(row);
  });
  if (!grid.length) return '';
  // colonnes et lignes entièrement vides (sélection Excel trop large) retirées
  let width = Math.max(...grid.map((r) => r.length));
  while (width > 1 && grid.every((r) => !r[width - 1])) width--;
  const full = grid.map((r) => Array.from({ length: width }, (_, k) => r[k] || '')).filter((r) => r.some(Boolean));
  if (!full.length) return '';
  if (width === 1 && full.length === 1) return full[0][0];
  const line = (r) => '| ' + r.map((c) => c || ' ').join(' | ') + ' |';
  return [line(full[0]), '|' + full[0].map(() => '----').join('|') + '|', ...full.slice(1).map(line)].join('\n').replace(/\|  \|/g, '|   |');
}

/* ------------------------------------------------------------------ */

/**
 * @param {string} html  contenu « text/html » du presse-papiers
 * @param {{imageBase?: string}} [opts]  adresse du répertoire des images (…/fichiers/)
 * @returns {{markdown: string, snippet: string|null, images: number, source: 'word'|'excel'|'web', rich: boolean}}
 *   snippet : le même Markdown en snippet VS Code (curseur sur le nom des images), s'il y a des images
 *   rich : le HTML contient de la mise en forme que le simple texte perdrait (titres, listes, tableaux…)
 */
function htmlToMarkdown(html, opts = {}) {
  const src = String(html || '');
  const base = String(opts.imageBase || DEFAULT_IMAGE_BASE).replace(/\/*$/, '/');
  const ctx = { images: 0 };
  const parts = blocks(parse(src), ctx).filter(Boolean);
  // Deux listes à la suite : sur le site (Python-Markdown) elles fusionneraient en une seule ; un
  // commentaire invisible les sépare
  for (let i = parts.length - 1; i > 0; i--) if (LIST_START.test(parts[i]) && LIST_START.test(parts[i - 1])) parts.splice(i, 0, LIST_BREAK);
  const marked = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim().split(IMAGE_BASE_MARK).join(base);
  const md = marked.split(NAME_MARK).join('');
  // Snippet VS Code : après le collage, le curseur va au nom de la première image (Tab : sa description,
  // puis l'image suivante)
  let tab = 0;
  const snippet = ctx.images ? escapeSnippet(marked).replace(/!\[([^\]\n]*(?:\\\][^\]\n]*)*)\]\(([^)\n]*)\u0001\)/g, (m, alt, url) => {
    const name = '${' + (++tab) + '}';
    const desc = '${' + (++tab) + ':' + alt + '}';
    return '![' + desc + '](' + url + name + ')';
  }) + '$0' : null;
  const word = /urn:schemas-microsoft-com:office:word|class="?Mso|mso-[a-z-]+\s*:/i.test(src);
  const excel = /urn:schemas-microsoft-com:office:excel|ProgId"?\s+content="?Excel/i.test(src);
  const rich = word || excel || /<(table|ul|ol|h[1-6]|b|strong|i|em|a|img)\b|font-weight\s*:\s*(bold|[6-9]00)|font-style\s*:\s*italic/i.test(src);
  return { markdown: md, snippet, images: ctx.images, source: excel ? 'excel' : word ? 'word' : 'web', rich };
}

/**
 * Texte copié depuis Excel (ou un tableau) : lignes de colonnes séparées par des tabulations → tableau.
 * @returns {string|null}  null si ce n'est pas un tableau
 */
function tabsToTable(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 2 || !lines.every((l) => l.includes('\t'))) return null;
  const cells = lines.map((l) => l.split('\t').map((c) => c.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\|/g, '\\|')));
  const width = Math.max(...cells.map((r) => r.length));
  if (width < 2) return null;
  const full = cells.map((r) => Array.from({ length: width }, (_, k) => r[k] || ''));
  const line = (r) => '| ' + r.map((c) => c || ' ').join(' | ') + ' |';
  return [line(full[0]), '|' + full[0].map(() => '----').join('|') + '|', ...full.slice(1).map(line)].join('\n');
}

/**
 * Simple texte (sans HTML) copié depuis Word : un paragraphe par ligne (Word ne laisse pas de ligne vide),
 * puces « • », « o », « ▪ »… en listes ; texte d'Excel en tableau.
 */
function plainToMarkdown(text) {
  const table = tabsToTable(text);
  if (table) return table;
  const out = [];
  let list = false;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/[\u00a0\t]+/g, ' ').trim();
    if (!line) { list = false; continue; }
    const bullet = /^[•·▪■◦o§➢➤✓–-]\s+(.*)$/.exec(line);
    const number = /^(\d+)[.)]\s+(.*)$/.exec(line);
    const depth = Math.min(3, Math.floor((/^[ \t]*/.exec(raw.replace(/\t/g, '    '))[0].length) / 4));
    if (bullet || number) {
      const item = '    '.repeat(depth) + (bullet ? '- ' + bullet[1] : number[1] + '. ' + number[2]);
      if (list) out[out.length - 1] += '\n' + item;
      else out.push(item);
      list = true;
      continue;
    }
    list = false;
    out.push(escapeBlockStart(line));
  }
  return out.join('\n\n');
}

/**
 * Lignes vides à ajouter autour d'un collage de plusieurs blocs (titre, liste, tableau…) pour qu'il ne se
 * colle pas au paragraphe voisin (sinon le site ne l'affiche pas comme un tableau ou une liste).
 * @param {string} markdown  texte collé
 * @param {{before: string, after: string, prevLine: string, nextLine: string}} around
 *   before / after : texte de la ligne avant et après le curseur ; prevLine / nextLine : lignes voisines
 */
function surround(markdown, around) {
  const block = markdown.includes('\n') || /^(#{1,6} |[-*+] |\d+[.)] |\||<!--)/.test(markdown);
  if (!block) return markdown;
  const before = around.before.trim() ? '\n\n' : (around.prevLine || '').trim() ? '\n' : '';
  const after = around.after.trim() ? '\n\n' : (around.nextLine || '').trim() ? '\n' : '';
  return before + markdown + after;
}

const escapeSnippet = (t) => t.replace(/[\\$}]/g, '\\$&');

module.exports = { htmlToMarkdown, tabsToTable, plainToMarkdown, surround, parse, DEFAULT_IMAGE_BASE };
