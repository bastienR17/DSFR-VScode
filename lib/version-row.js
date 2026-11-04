'use strict';
/**
 * Commande « Nouvelle version » : ajoute une ligne au tableau « Suivi des modifications » de la page,
 * avec le numéro suivant (V2 → V3, V1.2 → V1.3), la date du jour et l'émetteur de la dernière version.
 * Il ne reste qu'à écrire ce qui a changé (le curseur y est placé).
 *
 * La ligne va à la fin du tableau, ou en haut si le tableau est rangé de la plus récente à la plus
 * ancienne version.
 *
 * Module pur, testé par test/version-row.js.
 */

const splitRow = (line) => {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (t[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
};

const plain = (cell) => cell.replace(/\*\*|__|\*|_/g, '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isRow = (line) => /^\s*\|/.test(line || '');
const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || '');

/** Tableau des versions de la page : ligne d'en-tête qui contient « Version » et « Date ». */
function findTable(lines) {
  let fence = null;
  for (let i = 0; i < lines.length - 1; i++) {
    const l = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && f[1][0] === fence[0]) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    if (!isRow(l) || !isSeparator(lines[i + 1])) continue;
    const head = splitRow(l).map(plain);
    const col = (re) => head.findIndex((h) => re.test(h));
    const version = col(/^version/);
    const date = col(/^date/);
    if (version < 0 || date < 0) continue;
    let end = i + 2;
    while (end < lines.length && isRow(lines[end]) && !isSeparator(lines[end])) end++;
    return {
      header: i, first: i + 2, end, // lignes de données : [first, end)
      width: head.length,
      cols: { version, date, author: col(/^(emetteur|auteur|redacteur|redige)/), change: col(/(suivi|modification|objet|description|commentaire)/) },
    };
  }
  return null;
}

// « 28/10/2026 » → nombre comparable (aaaammjj), ou null
const dateValue = (cell) => {
  const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(cell || '');
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return y * 10000 + Number(m[2]) * 100 + Number(m[1]);
};

/** Numéro suivant : « V2 » → « V3 », « **V1.2** » → « **V1.3** », « 3 » → « 4 » ; null si illisible. */
function nextVersion(cell) {
  const m = /^(.*?)(\d+(?:[.,]\d+)*)(\D*)$/.exec(String(cell || '').trim());
  if (!m) return null;
  const parts = m[2].split(/([.,])/);
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return m[1] + parts.join('') + m[3];
}

const twoDigits = (n) => String(n).padStart(2, '0');
const escapeSnippet = (s) => s.replace(/[$}\\]/g, '\\$&');

/**
 * @param {string[]} lines  lignes de la page
 * @param {{today: Date, change?: string}} opts
 * @returns {{line: number, snippet: string, version: string, position: 'top'|'bottom'} | {error: string, noTable?: boolean}}
 *   line : où insérer (début de ligne) ; snippet : la ligne à insérer (snippet VS Code, se termine par \n)
 */
function addVersionRow(lines, opts = {}) {
  const t = findTable(lines);
  if (!t) return { noTable: true, error: 'Cette page n\'a pas de tableau « Suivi des modifications » (avec les colonnes Version et Date).' };
  const rows = [];
  for (let i = t.first; i < t.end; i++) rows.push(splitRow(lines[i]));
  const firstDate = rows.length ? dateValue(rows[0][t.cols.date]) : null;
  const lastDate = rows.length ? dateValue(rows[rows.length - 1][t.cols.date]) : null;
  const newestFirst = rows.length > 1 && firstDate !== null && lastDate !== null && firstDate > lastDate;
  const latest = newestFirst ? rows[0] : rows[rows.length - 1];
  // Numéro : le plus grand des numéros lisibles (ou la dernière ligne), +1
  let version = latest ? nextVersion(latest[t.cols.version]) : null;
  if (!version) version = 'V1';
  const today = opts.today || new Date();
  const date = twoDigits(today.getDate()) + '/' + twoDigits(today.getMonth() + 1) + '/' + today.getFullYear();
  const cells = Array.from({ length: t.width }, () => '');
  cells[t.cols.version] = escapeSnippet(version);
  cells[t.cols.date] = escapeSnippet(date);
  // Le curseur va d'abord sur « ce qui a changé » (1), puis sur l'émetteur (2), qui reste souvent le même
  const changeCol = t.cols.change >= 0 ? t.cols.change : t.width - 1;
  if (changeCol !== t.cols.version && changeCol !== t.cols.date) cells[changeCol] = '${1:' + escapeSnippet(opts.change || 'Ce qui a changé') + '}';
  if (t.cols.author >= 0 && t.cols.author !== changeCol) cells[t.cols.author] = '${2:' + escapeSnippet((latest && latest[t.cols.author]) || 'Émetteur') + '}';
  const snippet = '| ' + cells.map((c) => c || ' ').join(' | ') + ' |\n';
  return { line: newestFirst ? t.first : t.end, snippet, version, position: newestFirst ? 'top' : 'bottom' };
}

module.exports = { addVersionRow, nextVersion, findTable };
