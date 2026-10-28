'use strict';
/**
 * Panneau « Composants DSFR » (barre latérale) : la liste des composants rangés par familles, avec une
 * vignette de chacun (media/thumbnails, générées par scripts/thumbnails.js), une phrase d'explication et
 * une recherche. Un clic insère le composant dans la page ouverte (extension.js reçoit le message).
 *
 * Module pur : il fabrique le HTML de la vue (testé par test/component-panel.js et dans Chromium).
 */
const { esc } = require('./html');
const { buildMenu, FAMILIES } = require('./component-menu');

// Une couleur du DSFR par famille (bandeau de titre et liseré des cartes) : [thème clair, thème sombre]
const FAMILY_COLORS = {
  sirh: ['#000091', '#8B8BFF'], messages: ['#E1000F', '#FF6F6F'], cards: ['#18753C', '#34CB6A'], fold: ['#A558A0', '#E8A3E3'],
  links: ['#B34000', '#FF9575'], media: ['#006A6F', '#34CBC5'], header: ['#6A6AF4', '#A1A1F8'], other: ['#666666', '#AAAAAA'],
};

/**
 * @param {object} p
 * @param {object} p.snippets                      contenu de snippets/dsfr.json
 * @param {(prefix: string) => string|null} p.thumb  adresse de la vignette d'un composant (ou null)
 * @param {string} p.cspSource                     source autorisée pour les images et styles (webview.cspSource)
 * @param {string} p.nonce                         jeton du script
 */
function panelHtml(p) {
  const menu = buildMenu(p.snippets);
  const labels = Object.fromEntries(FAMILIES.map((f) => [f.id, f.label]));
  const groups = [];
  for (const m of menu) {
    if (m.separator) continue;
    let g = groups[groups.length - 1];
    if (!g || g.id !== m.family) groups.push(g = { id: m.family, label: labels[m.family] || 'Autres', items: [] });
    g.items.push(m);
  }
  const card = (m) => {
    const src = p.thumb(m.prefix);
    const words = (m.label + ' ' + m.prefix + ' ' + m.detail).toLowerCase();
    return '<button class="card" data-prefix="' + esc(m.prefix) + '" data-words="' + esc(words) + '" title="' + esc(m.label + ' : ' + m.detail) + '\nCliquer pour l\'insérer dans la page">' +
      (src ? '<span class="thumb"><img loading="lazy" alt="" src="' + esc(src) + '"></span>' : '') +
      '<span class="name">' + esc(m.label) + '</span><span class="detail">' + esc(m.detail) + '</span>' +
      '<span class="prefix">' + esc(m.prefix) + '</span></button>';
  };
  const body = groups.map((g) => {
    const [light, dark] = FAMILY_COLORS[g.id] || FAMILY_COLORS.other;
    return '<details class="family" open style="--cl:' + light + ';--cd:' + dark + '"><summary><span class="dot"></span>' + esc(g.label) +
      ' <span class="count">' + g.items.length + '</span></summary><div class="cards">' + g.items.map(card).join('') + '</div></details>';
  }).join('');
  const csp = "default-src 'none'; img-src " + p.cspSource + " https: data:; style-src 'unsafe-inline'; script-src 'nonce-" + p.nonce + "';";
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="' + csp + '">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><style>' + CSS + '</style></head><body>' +
    '<div class="top"><input id="search" type="search" placeholder="Chercher : alerte, carte, capture…" aria-label="Chercher un composant">' +
    '<p class="hint">Placez le curseur dans la page, puis cliquez sur un composant pour l\'insérer.</p></div>' +
    '<main id="list">' + body + '<p id="empty" hidden>Aucun composant ne correspond à cette recherche.</p></main>' +
    '<script nonce="' + p.nonce + '">' + SCRIPT + '</script></body></html>';
}

const CSS = `
[hidden] { display: none !important; }
body { padding: 0 10px 16px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 13px; }
.top { position: sticky; top: 0; padding: 10px 0 6px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); z-index: 2; }
#search { width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 6px; border: 1px solid var(--vscode-input-border, transparent);
  background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: inherit; }
#search:focus { outline: 2px solid var(--vscode-focusBorder); outline-offset: -1px; }
.hint { margin: 7px 2px 2px; opacity: .75; font-size: 12px; line-height: 1.35; }
.family { --c: var(--cl); margin: 10px 0 4px; }
body.vscode-dark .family, body.vscode-high-contrast:not(.vscode-high-contrast-light) .family { --c: var(--cd); }
.family summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; font-weight: 600; padding: 6px 8px; border-radius: 6px;
  background: color-mix(in srgb, var(--c) 14%, transparent); border-left: 4px solid var(--c); }
.family summary::-webkit-details-marker { display: none; }
.family summary::after { content: '▾'; margin-left: auto; opacity: .7; }
.family:not([open]) summary::after { content: '▸'; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; }
.count { font-weight: 400; opacity: .7; font-size: 11px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 7px; margin-top: 8px; }
.card { display: flex; flex-direction: column; align-items: stretch; text-align: left; padding: 0; overflow: hidden; cursor: pointer; font: inherit;
  color: inherit; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.35));
  border-top: 3px solid var(--c); border-radius: 8px; transition: transform .08s, box-shadow .08s; }
.card:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,.18); border-color: var(--c); }
.card:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
.thumb { display: flex; align-items: flex-start; justify-content: center; background: #fff; height: 74px; overflow: hidden; border-bottom: 1px solid rgba(128,128,128,.2); }
.thumb img { max-width: 100%; max-height: 74px; object-fit: contain; object-position: top center; }
.name { font-weight: 600; padding: 6px 8px 2px; line-height: 1.25; }
.detail { padding: 0 8px; margin-bottom: 5px; opacity: .8; font-size: 11px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.prefix { margin: auto 8px 7px; max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; align-self: flex-start; font-family: var(--vscode-editor-font-family, monospace); font-size: 10.5px; padding: 1px 5px; border-radius: 4px;
  color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
#empty { opacity: .75; padding: 12px 2px; }
`;

// Recherche (insensible aux accents) et insertion au clic
const SCRIPT = `
const vscode = acquireVsCodeApi();
const norm = (s) => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const search = document.getElementById('search');
search.addEventListener('input', () => {
  const words = norm(search.value).split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const fam of document.querySelectorAll('.family')) {
    let n = 0;
    for (const card of fam.querySelectorAll('.card')) {
      const ok = words.every((w) => norm(card.dataset.words).includes(w));
      card.hidden = !ok;
      if (ok) n++;
    }
    fam.hidden = n === 0;
    if (words.length && n) fam.open = true;
    shown += n;
  }
  document.getElementById('empty').hidden = shown > 0;
});
document.getElementById('list').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) vscode.postMessage({ type: 'insert', prefix: card.dataset.prefix });
});
`;

module.exports = { panelHtml, FAMILY_COLORS };
