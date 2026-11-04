// Génère les vignettes du panneau « Composants DSFR » (media/thumbnails/<raccourci>.jpg) :
// chaque snippet de snippets/dsfr.json, rempli avec ses valeurs d'exemple, rendu avec le DSFR.
// Utilisation : node scripts/thumbnails.js   (Playwright et Chromium requis, comme les tests)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const createMd = require('../test/vscode-like.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'media', 'thumbnails');
const snippets = require('../snippets/dsfr.json');

// Image d'exemple (les images de Doc SIRH sont sur l'intranet) : un paysage stylisé aux couleurs du DSFR,
// servie à l'adresse /exemple.svg
const PICTURE_SVG = (
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
  '<rect width="640" height="360" fill="#e3e3fd"/><circle cx="500" cy="90" r="42" fill="#fcc63a"/>' +
  '<path d="M0 300 L170 140 L300 270 L400 190 L640 330 L640 360 L0 360Z" fill="#6a6af4"/>' +
  '<path d="M0 330 L220 230 L380 320 L520 260 L640 320 L640 360 L0 360Z" fill="#000091"/></svg>');
const PICTURE = '/exemple.svg';

// Remplit un snippet avec ses valeurs par défaut (comme test/snippets.js), date du jour d'exemple
function fill(body) {
  return body
    .replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, 'Exemple')
    .replace(/\$CURRENT_DATE/g, '28').replace(/\$CURRENT_MONTH/g, '10').replace(/\$CURRENT_YEAR/g, '2026')
    .replace(/\$\d+/g, '');
}

function source(name, s) {
  let src = fill([].concat(s.body).join('\n'));
  const prefix = [].concat(s.prefix)[0];
  // Clés d'en-tête : rendues dans un en-tête complet, avec des titres pour le sommaire
  if (/en-tête ---/.test(s.description)) src = '---\n' + src + '\n---\n\n# Titre de la page\n\n## Première partie\n\n## Deuxième partie\n';
  // Niveau de fil d'Ariane : montré dans le fil d'Ariane complet
  if (/^\s*<li>/.test(src)) src = fill(snippets["Doc SIRH : fil d'Ariane"].body.join('\n'));
  if (prefix === 'dsfr-img') src = '![Capture de l\'écran](https://docsirh.e2.rie.gouv.fr/fichiers/exemple.png)';
  if (prefix === 'dsfr-sirh-version') src = src.replace(/\bVExemple\b/, 'V2');
  // Nouvelle version du suivi : la ligne montrée dans son tableau
  if (prefix === 'dsfr-sirh-version') src = '| **Version** | **Date** | **Emetteur** | **Suivi des modifications** |\n|---|---|---|---|\n' + src.trim() + '\n';
  // Accordéons montrés ouverts
  src = /^\s+open\s*:/m.test(src) ? src.replace(/^(\s+open\s*:\s*)false\b/gm, '$1true') : src.replace(/^(\/\/\/ accordion \|[^\n]*)$/gm, '$1\n    open: true');
  // Images : l'exemple remplace les adresses de Doc SIRH (sur l'intranet) et les chemins d'exemple
  return src.replace(/https:\/\/docsirh\.e2\.rie\.gouv\.fr\/fichiers\/[^\s)"'|]*/g, PICTURE)
    .replace(/(\b(?:image|poster|url)\s*:\s*)(?!\/exemple)\S+\.(?:png|jpe?g|svg|gif)\b/g, '$1' + PICTURE);
}

const md = createMd({ showErrors: () => false });
const pages = {};
for (const [name, s] of Object.entries(snippets)) {
  const prefix = [].concat(s.prefix)[0];
  pages[prefix] = md.render(source(name, s), {}); // le marqueur d'état active le script de l'aperçu (accordéons ouverts)
}

const sheets = ['dsfr/dsfr.min.css', 'dsfr/utility/utility.min.css', 'dsfr/css/theme.css', 'dsfr-preview.css'];
const page = (body) => '<!DOCTYPE html><html data-fr-theme="light"><head><meta charset="utf-8">' +
  sheets.map((s) => '<link rel="stylesheet" href="/media/' + s + '">').join('') +
  '<style>html,body{font-size:16px;background:#fff;margin:0} #cap{width:560px;padding:18px 20px;background:#fff}' +
  ' #cap > #dsfr-preview-state + *{margin-top:0} #cap > :last-child{margin-bottom:0}</style></head>' +
  '<body class="dsfr-preview"><div id="cap">' + body + '</div><script src="/media/dsfr-preview.js"></script></body></html>';

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const m = /^\/page\/(.+)$/.exec(url);
  if (m) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page(pages[m[1]])); }
  if (url === '/exemple.svg') { res.setHeader('Content-Type', 'image/svg+xml'); return res.end(PICTURE_SVG); }
  fs.readFile(path.join(ROOT, url), (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    const type = url.endsWith('.css') ? 'text/css' : url.endsWith('.js') ? 'text/javascript' : url.endsWith('.svg') ? 'image/svg+xml' : url.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.end(d);
  });
}).listen(0, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  for (const prefix of Object.keys(pages)) {
    await tab.goto('http://127.0.0.1:' + server.address().port + '/page/' + prefix);
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(400);
    // Cadre ajusté au contenu (un badge ou un bouton seul ne laisse pas un grand vide à droite)
    const box = await tab.evaluate(() => {
      const cap = document.getElementById('cap');
      let right = 0;
      let bottom = cap.offsetHeight;
      for (const el of cap.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (getComputedStyle(el).display !== 'block') right = Math.max(right, r.right);
        bottom = Math.max(bottom, Math.ceil(r.bottom) + 18);
      }
      for (const el of cap.children) if (el.offsetHeight) right = Math.max(right, el.getBoundingClientRect().right);
      return { width: Math.min(cap.offsetWidth, Math.ceil(right) + 20), height: bottom };
    });
    await tab.screenshot({ path: path.join(OUT, prefix + '.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: Math.max(box.width, 160), height: Math.min(box.height, 380) } });
  }
  await browser.close();
  server.close();
  console.log(Object.keys(pages).length + ' vignettes → media/thumbnails/');
});
