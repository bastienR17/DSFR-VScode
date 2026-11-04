'use strict';
/**
 * Défauts de rédaction visibles sur le site (avertissements), relevés sur de vraies pages Doc SIRH :
 *   - lien mal formé : « [texte(https://…) » (il manque « ] ») ou « [texte](https://… » (il manque « ) ») :
 *     le site affiche le texte brut, crochets compris ;
 *   - astérisques échappés « \*\*texte\*\* » (copier-coller depuis Word) : affichés au lieu du gras ;
 *   - titre coupé en deux : « ### … la bonne » puis, après une ligne vide, « journée non travaillée » :
 *     la fin du titre devient un paragraphe et le sommaire ne montre que le début.
 *
 * Conseils de qualité pour la page ouverte, signalés discrètement (niveau « information ») :
 *   - images sans description (texte alternatif vide ou absent) : obligatoire pour l'accessibilité
 *     d'un site public (RGAA), et lu par les lecteurs d'écran ;
 *   - liens absolus vers une page du site lui-même (https://docsirh…/rubrique/page/) : un lien
 *     relatif vers le fichier .md reste valable si l'adresse du site change, et MkDocs le vérifie.
 *     Les fichiers déposés à part (…/fichiers/…) ne sont pas concernés.
 *
 * Module pur : l'accès aux fichiers est fourni par l'appelant.
 */
const path = require('path');
const MarkdownIt = require('./vendor/markdown-it.min.js');
const { frontMatterRule } = require('./lint');

const md = new MarkdownIt({ html: true });
md.block.ruler.before('table', 'dsfr_front_matter', frontMatterRule);

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const ALT_RE = /\balt\s*=\s*("[^"]*\S[^"]*"|'[^']*\S[^']*'|[^\s"'>]+)/i;

/**
 * @param {string} text
 * @param {object} ctx
 * @param {boolean} [ctx.checkAlt]  signaler les images sans description
 * @param {string} [ctx.siteUrl]  adresse du site (site_url du mkdocs.yml, ou réglage)
 * @param {string} [ctx.file]  chemin de la page ; avec docsDir et exists, permet de proposer le lien relatif
 * @param {string|null} [ctx.docsDir]
 * @param {(p: string) => boolean} [ctx.exists]
 * @returns {import('./lint').Issue[]}
 */
function checkQuality(text, ctx) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const issues = [];
  const info = (code, message, range, fixes) => issues.push({ code, severity: 'info', message, range, fixes: fixes || [] });
  const warn = (code, message, range, fixes) => issues.push({ code, severity: 'warning', message, range, fixes: fixes || [] });

  // Lignes de code (blocs ```) : ignorées
  const inCode = new Set();
  let fence = null;
  lines.forEach((l, i) => {
    const f = FENCE_RE.exec(l);
    if (fence) { inCode.add(i); if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return; }
    if (f) { fence = f[1]; inCode.add(i); }
  });

  // En-tête YAML : ignoré (ses lignes « # … » sont des commentaires, pas des titres)
  let fmEnd = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) fmEnd = end + 1;
  }
  const skip = (i) => i < fmEnd || inCode.has(i);
  const edit = (line, start, end, text) => ({ start: { line, character: start }, end: { line, character: end }, text });

  // 0) Défauts visibles sur le site
  lines.forEach((l, i) => {
    if (skip(i)) return;
    const masked = l.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length)); // code en ligne ignoré
    let m;
    // [texte(https://…)  → il manque « ] »
    const noBracket = /(!?)\[([^\[\]\n]+?)\((https?:\/\/[^\s()]+)\)/g;
    while ((m = noBracket.exec(masked))) {
      const paren = m.index + m[1].length + 1 + m[2].length;
      warn('dsfr-link-broken', 'Lien mal formé : il manque « ] » avant « ( ». Sur le site, le texte s\'affiche tel quel, crochets et adresse compris.',
        { line: i, start: m.index, end: m.index + m[0].length },
        [{ title: 'Ajouter « ] » avant « ( »', preferred: true, edits: [edit(i, paren, paren, ']')] }]);
    }
    // [texte](https://…  sans « ) » jusqu'à la fin de la ligne  → il manque « ) »
    const noParen = /\[[^\[\]\n]+\]\((https?:\/\/[^\s()]+)\s*$/.exec(masked);
    if (noParen) {
      const end = noParen.index + noParen[0].trimEnd().length;
      warn('dsfr-link-broken', 'Lien mal formé : il manque « ) » à la fin de l\'adresse. Sur le site, le texte s\'affiche tel quel, crochets et adresse compris.',
        { line: i, start: noParen.index, end },
        [{ title: 'Ajouter « ) » à la fin de l\'adresse', preferred: true, edits: [edit(i, end, end, ')')] }]);
    }
    // \*\*texte\*\*  → affiché avec les étoiles
    const escaped = /\\\*\\\*([^*\n]+?)\\\*\\\*/g;
    while ((m = escaped.exec(masked))) {
      const word = m[1].trim();
      if (!word) continue;
      const space = /\s$/.test(m[1]) ? ' ' : '';
      warn('dsfr-escaped-strong', 'Astérisques échappés : « ' + m[0] + ' » s\'affiche avec ses « ** » au lieu d\'être en gras (souvent après un copier-coller depuis Word). ' +
        'Pour du gras, retirez les « \\ ».',
        { line: i, start: m.index, end: m.index + m[0].length },
        [{ title: 'Mettre en gras : « **' + word + '**' + space + '»', preferred: true, edits: [edit(i, m.index, m.index + m[0].length, '**' + word + '**' + space)] }]);
    }
  });
  // Titre coupé : « ### … de » / ligne vide / « congé » (une seule ligne, commence par une minuscule)
  lines.forEach((l, i) => {
    const h = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(l);
    if (!h || skip(i) || !h[2] || /[.:;!?»)\]]$/.test(h[2])) return;
    const next = i + 2;
    if ((lines[i + 1] || '').trim() || skip(next)) return;
    const t = (lines[next] || '').trim();
    if (!t || !/^\p{Ll}/u.test(t) || t.length > 80 || /[.!?]$/.test(t)) return;
    if ((lines[next + 1] || '').trim()) return; // un vrai paragraphe continue sur la ligne suivante
    warn('dsfr-split-heading', 'Titre coupé en deux ? La ligne ' + (next + 1) + ' (« ' + t + ' ») commence par une minuscule et semble être la fin de ce titre. ' +
      'Sur le site, elle s\'affiche comme un paragraphe sous le titre, et le sommaire ne montre que le début.',
      { line: i, start: 0, end: l.length },
      [{ title: 'Recoller la fin du titre : « … ' + t + ' »', preferred: true, edits: [{ start: { line: i, character: l.replace(/[ \t#]*$/, '').length }, end: { line: next, character: (lines[next] || '').length }, text: ' ' + t }] }]);
  });

  // 1) Images sans description
  if (ctx.checkAlt !== false) {
    // ![](adresse) : texte entre crochets vide
    lines.forEach((l, i) => {
      if (inCode.has(i)) return;
      const re = /!\[\s*\]\(/g;
      let m;
      while ((m = re.exec(l))) {
        info('dsfr-img-alt', 'Image sans description : écrivez entre les crochets ce que montre l\'image (lue par les lecteurs d\'écran, obligatoire pour l\'accessibilité RGAA). Pour une image purement décorative, laissez vide.',
          { line: i, start: m.index, end: m.index + m[0].length - 1 });
      }
    });
    // <img …> sans attribut alt (la balise peut tenir sur plusieurs lignes)
    const offsets = [];
    let pos = 0;
    for (const l of lines) { offsets.push(pos); pos += l.length + 1; }
    const flat = lines.join('\n');
    const re = /<img\b[^>]*>/gi;
    let m;
    while ((m = re.exec(flat))) {
      let line = 0;
      while (line + 1 < offsets.length && offsets[line + 1] <= m.index) line++;
      if (inCode.has(line) || ALT_RE.test(m[0])) continue;
      const start = m.index - offsets[line];
      // Correction : ajouter alt="" juste après « <img », à compléter par l'auteur
      info('dsfr-img-alt', 'Capture sans description (attribut alt) : ajoutez alt="…" avec ce que montre l\'image (lue par les lecteurs d\'écran, obligatoire pour l\'accessibilité RGAA).',
        { line, start, end: start + 4 },
        [{ title: 'Ajouter alt="" (à compléter)', edits: [{ start: { line, character: start + 4 }, end: { line, character: start + 4 }, text: ' alt=""' }] }]);
    }
  }

  // 2) Liens absolus vers une page du site
  const site = String(ctx.siteUrl || '').trim().replace(/\/+$/, '');
  if (site) {
    let tokens = [];
    try { tokens = md.parse(text, {}); } catch (e) { tokens = []; }
    for (const t of tokens) {
      if (t.type !== 'inline' || !t.children || !t.map) continue;
      // Les liens d'un paragraphe sont cherchés dans l'ordre, chacun après le précédent
      const cursor = { line: t.map[0], col: 0 };
      for (const c of t.children) {
        if (c.type !== 'link_open') continue;
        const href = c.attrGet('href') || '';
        let written = href;
        try { written = decodeURI(href); } catch (e) { /* adresse laissée telle quelle */ }
        const range = findLink(lines, t.map[1], cursor, [href, written]);
        if (!range) continue;
        cursor.line = range.line; cursor.col = range.end;
        if (!href.toLowerCase().startsWith(site.toLowerCase() + '/') && href.toLowerCase() !== site.toLowerCase()) continue;
        const rest = href.slice(site.length);
        if (/^\/fichiers\//i.test(rest)) continue; // fichiers déposés à part : lien absolu normal
        const fixes = [];
        const rel = relativeTarget(rest, ctx);
        if (rel) fixes.push({ title: 'Remplacer par le lien relatif « ' + rel + ' »', preferred: true, edits: [{ start: { line: range.line, character: range.start }, end: { line: range.line, character: range.end }, text: rel }] });
        info('dsfr-absolute-link', 'Lien complet vers une page du site : un lien vers le fichier .md' +
          (rel ? ' (« ' + rel + ' », proposé par l\'ampoule 💡)' : '') + ' est préférable. Il continue de marcher si l\'adresse du site change, et le site vérifie qu\'il n\'est pas cassé.', range, fixes);
      }
    }
  }
  return issues.sort((a, b) => a.range.line - b.range.line || a.range.start - b.range.start);
}

// Adresse d'un lien écrite dans le texte : « (adresse) », « (adresse "titre") » ou « <adresse> »,
// cherchée à partir de `cursor` (la même adresse peut être le début d'une autre, plus longue).
function findLink(lines, endLine, cursor, forms) {
  for (let l = cursor.line; l < endLine && l < lines.length; l++) {
    const text = lines[l];
    let best = null;
    for (const f of forms) {
      if (!f) continue;
      let at = text.indexOf(f, l === cursor.line ? cursor.col : 0);
      while (at >= 0) {
        const before = text[at - 1];
        const after = text[at + f.length];
        if ((before === '(' || before === '<') && (after === undefined || /[)\s>"']/.test(after))) break;
        at = text.indexOf(f, at + 1);
      }
      if (at >= 0 && (!best || at < best.start)) best = { line: l, start: at, end: at + f.length };
    }
    if (best) return best;
  }
  return null;
}

// « /rubrique/page/#ancre » → chemin relatif vers rubrique/page.md (ou rubrique/page/index.md), si le fichier existe.
function relativeTarget(urlPath, ctx) {
  if (!ctx.docsDir || !ctx.file || !ctx.exists) return null;
  const hash = urlPath.indexOf('#');
  const anchor = hash >= 0 ? urlPath.slice(hash) : '';
  let p = (hash >= 0 ? urlPath.slice(0, hash) : urlPath).split('?')[0];
  try { p = decodeURI(p); } catch (e) { /* adresse laissée telle quelle */ }
  p = p.replace(/^\/+|\/+$/g, '');
  const candidates = p
    ? [p + '.md', path.join(p, 'index.md'), path.join(p, 'README.md'), p.replace(/\.html$/i, '.md')]
    : ['index.md', 'README.md'];
  for (const c of candidates) {
    const full = path.join(ctx.docsDir, c);
    if (ctx.exists(full)) {
      const rel = path.relative(path.dirname(ctx.file), full).split(path.sep).join('/');
      return (rel || path.basename(full)) + anchor;
    }
  }
  return null;
}

module.exports = { checkQuality };
