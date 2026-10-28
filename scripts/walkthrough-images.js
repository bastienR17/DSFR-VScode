// Génère les illustrations du pas-à-pas « Bien démarrer » (media/walkthrough/*.png).
// Utilisation : node scripts/walkthrough-images.js   (Playwright et Chromium requis, comme les tests)
// Les scènes imitent VS Code en thème clair, avec les couleurs du DSFR et celles de l'extension.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'media', 'walkthrough');

const CSS = `
@font-face { font-family: Marianne; src: url(/media/dsfr/fonts/Marianne-Regular.woff2); }
@font-face { font-family: Marianne; font-weight: 700; src: url(/media/dsfr/fonts/Marianne-Bold.woff2); }
* { box-sizing: border-box; }
body { margin: 0; width: 960px; height: 600px; font-family: Marianne, sans-serif; overflow: hidden;
  background: linear-gradient(135deg, #e3e3fd 0%, #f5f5fe 45%, #fee9e9 100%); }
.win { position: absolute; left: 40px; top: 40px; width: 880px; height: 520px; background: #fff; border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0,0,145,.18), 0 2px 6px rgba(0,0,0,.08); overflow: hidden; display: flex; flex-direction: column; }
.bar { height: 34px; background: #f3f3f3; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; padding: 0 12px; gap: 7px; font-size: 13px; color: #555; }
.dot { width: 12px; height: 12px; border-radius: 50%; } .r { background: #ff5f57; } .y { background: #febc2e; } .g { background: #28c840; }
.bar .t { margin-left: 14px; }
.main { flex: 1; display: flex; min-height: 0; }
.act { width: 44px; background: #f8f8f8; border-right: 1px solid #ececec; }
.side { width: 210px; background: #fafafa; border-right: 1px solid #ececec; padding: 10px 0; font-size: 13px; color: #333; }
.side .h { font-size: 11px; font-weight: 700; color: #777; padding: 4px 14px; letter-spacing: .04em; }
.side .f { padding: 4px 14px 4px 28px; } .side .d { padding: 4px 14px; font-weight: 700; }
.side .sel { background: #e3e3fd; color: #000091; font-weight: 700; border-left: 3px solid #000091; padding-left: 25px; }
.ed { flex: 1; position: relative; font: 14px/23px 'DejaVu Sans Mono', Menlo, monospace; padding: 14px 0; color: #1f1f1f; min-width: 0; }
.tab { position: absolute; top: 0; left: 0; right: 0; height: 32px; background: #f3f3f3; border-bottom: 1px solid #e5e5e5; display: flex; }
.tab span { background: #fff; padding: 7px 16px; font: 13px Marianne, sans-serif; border-right: 1px solid #e5e5e5; color: #000091; }
.code { margin-top: 26px; }
.ln { display: flex; padding-right: 10px; white-space: pre; }
.ln i { width: 38px; text-align: right; color: #aaa; font-style: normal; margin-right: 14px; flex: none; }
.band { background: rgba(106,106,244,.08); }
.fe { color: #E1000F; font-weight: bold; } .nm { color: #000091; font-weight: bold; } .ti { color: #00796B; } .ky { color: #A558A0; }
.h1 { color: #000091; font-weight: bold; } .muted { color: #777; }
.status { height: 28px; background: #f3f3f3; border-top: 1px solid #e5e5e5; display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 0 10px; font-size: 12.5px; color: #333; }
.status span { padding: 3px 9px; border-radius: 4px; }
.ok { color: #18753C; font-weight: 700; } .bad { background: #c9191e; color: #fff; font-weight: 700; }
.hl { outline: 3px solid #E1000F; outline-offset: 2px; border-radius: 6px; }
.chip { position: absolute; left: 40px; top: 8px; background: #000091; color: #fff; font-weight: 700; font-size: 15px;
  padding: 6px 16px 6px 8px; border-radius: 999px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,145,.3); z-index: 5; }
.chip b { background: #fff; color: #000091; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.split { display: flex; flex: 1; min-width: 0; } .split > div { flex: 1; min-width: 0; position: relative; }
.prev { border-left: 1px solid #e5e5e5; overflow: hidden; }
.prev img { width: 100%; display: block; margin-top: 32px; }
.qp { position: absolute; left: 50%; transform: translateX(-50%); top: 40px; width: 470px; background: #fff; border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25); font: 13.5px Marianne, sans-serif; overflow: hidden; z-index: 4; border: 1px solid #ddd; }
.qp .in { margin: 8px; border: 2px solid #000091; border-radius: 4px; padding: 6px 9px; color: #666; }
.qp .sep { padding: 6px 12px 3px; font-size: 11.5px; color: #000091; font-weight: 700; border-top: 1px solid #eee; }
.qp .it { padding: 6px 12px; display: flex; gap: 10px; align-items: baseline; }
.qp .it small { color: #888; } .qp .on { background: #e3e3fd; }
.qp .ic { width: 22px; text-align: center; }
.wavy { text-decoration: underline wavy #c9191e; text-decoration-thickness: 1.5px; text-underline-offset: 4px; }
.bulb { position: absolute; left: 6px; font-size: 16px; }
.menu { position: absolute; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 8px 22px rgba(0,0,0,.2);
  font: 13.5px Marianne, sans-serif; width: 360px; overflow: hidden; z-index: 4; }
.menu div { padding: 7px 12px; } .menu .on { background: #000091; color: #fff; }
.hover { position: absolute; background: #fffbe6; border: 1px solid #f0d78a; border-radius: 6px; padding: 9px 12px; font: 13px/19px Marianne, sans-serif; width: 470px; color: #333; z-index: 3; }
.set { padding: 46px 30px 0; font: 14px Marianne, sans-serif; width: 100%; }
.set h3 { margin: 0 0 14px; color: #000091; }
.row { padding: 12px 0; border-bottom: 1px solid #eee; }
.row b { display: block; margin-bottom: 4px; } .row span { color: #666; font-size: 13px; }
.sel2 { display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 3px 10px; margin-top: 6px; background: #f6f6f6; }
.cb { display: inline-block; width: 16px; height: 16px; border-radius: 3px; background: #000091; color: #fff; font-size: 12px; text-align: center; line-height: 16px; margin-right: 8px; vertical-align: -2px; }
`;

const code = (rows) => '<div class="code">' + rows.map((r, n) => '<div class="ln' + (r[1] ? ' band' : '') + '"><i>' + (n + 1) + '</i><span>' + (r[0] || ' ') + '</span></div>').join('') + '</div>';
const window_ = (title, inner, status) => '<div class="win"><div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="t">' + title + '</span></div><div class="main">' + inner + '</div>' +
  '<div class="status">' + (status || '<span>＋ Insérer un composant</span><span class="ok">✓ Page sans erreur</span><span>👁 Aperçu DSFR</span>') + '</div></div>';
const chip = (n, text) => '<div class="chip"><b>' + n + '</b>' + text + '</div>';
const explorer = '<div class="act"></div><div class="side"><div class="h">EXPLORATEUR</div><div class="d">▾ docs</div><div class="d" style="padding-left:24px">▾ RH-proximite</div>' +
  '<div class="f sel">Esteve.md</div><div class="f">Gestion-des-primes.md</div><div class="d" style="padding-left:24px">▸ GA-PAYE</div><div class="d" style="padding-left:24px">▸ Formation</div></div>';
const pageCode = [
  ['<span class="h1"># Estève : gestion de la campagne</span>'],
  [''],
  ['L’outil Estève permet de gérer la campagne'],
  ['d’évaluation professionnelle.'],
  [''],
  ['<span class="fe">///</span> <span class="nm">alert</span> <span class="fe">|</span> <span class="ti">À savoir</span>', 1],
  ['    <span class="ky">type</span>: info'],
  ['La campagne ouvre le 2 janvier.'],
  ['<span class="fe">///</span>', 1],
  [''],
  ['<span class="fe">///</span> <span class="nm">row</span> <span class="fe">|</span> <span class="ti">fr-grid-row--gutters</span>', 1],
  ['<span class="fe">///</span> <span class="nm">col</span>', 1],
  ['<span class="fe">///</span> <span class="nm">card</span> <span class="fe">|</span> <span class="ti">Relancer sa campagne</span>', 1],
  ['    <span class="ky">target</span>: campagne_esteve'],
];

const SCENES = {
  '1-page': chip(1, 'Ouvrez une page .md') + window_('Esteve.md — Doc SIRH', explorer + '<div class="ed"><div class="tab"><span>Esteve.md</span></div>' + code(pageCode) + '</div>'),
  '2-apercu': chip(2, 'L’aperçu montre la page comme sur le site') + window_('Esteve.md — Doc SIRH',
    '<div class="act"></div><div class="split"><div class="ed"><div class="tab"><span>Esteve.md</span><span style="margin-left:auto;background:none;border:0" class="hl">⧉ Aperçu</span></div>' + code(pageCode.slice(0, 12)) + '</div>' +
    '<div class="prev"><div class="tab"><span>Aperçu Esteve.md</span></div><img src="/docs/images/apercu-clair.png"></div></div>'),
  '3-inserer': chip(3, 'Insérez un composant en un clic') + window_('Esteve.md — Doc SIRH', explorer + '<div class="ed"><div class="tab"><span>Esteve.md</span></div>' + code(pageCode.slice(0, 9)) +
    '<div class="qp"><div class="in">Choisissez un composant (alerte, carte, capture…)</div>' +
    '<div class="sep">DOC SIRH — LES BLOCS DE L’ÉQUIPE</div>' +
    '<div class="it on"><span class="ic">📷</span>Capture d’écran <small>dsfr-sirh-capture</small></div>' +
    '<div class="it"><span class="ic">🕘</span>Nouvelle version <small>dsfr-sirh-version</small></div>' +
    '<div class="it"><span class="ic">💬</span>Consigne <small>dsfr-sirh-consigne</small></div>' +
    '<div class="sep">MESSAGES ET ENCADRÉS</div>' +
    '<div class="it"><span class="ic">⚠️</span>Alerte <small>dsfr-alerte</small></div>' +
    '<div class="sep">CARTES, TUILES ET GRILLES</div>' +
    '<div class="it"><span class="ic">▦</span>3 cartes côte à côte <small>dsfr-carte-3</small></div></div></div>',
    '<span class="hl" style="background:#e3e3fd;color:#000091;font-weight:700">＋ Insérer un composant</span><span class="ok">✓ Page sans erreur</span><span>👁 Aperçu DSFR</span>'),
  '4-corriger': chip(4, 'Corrigez avec l’ampoule 💡') + window_('Esteve.md — Doc SIRH', explorer + '<div class="ed"><div class="tab"><span>Esteve.md</span></div>' +
    code([pageCode[0], [''], pageCode[2], pageCode[3], [''], pageCode[5], ['    <span class="ky">type</span>: <span class="wavy">warnig</span>'], pageCode[7], pageCode[8]]) +
    '<span class="bulb" style="top:178px">💡</span>' +
    '<div class="menu" style="left:130px;top:215px"><div class="on">Remplacer « warnig » par « warning »</div><div>Remplacer par « info »</div></div>' +
    '<div class="hover" style="left:52px;top:300px"><b>« warnig » n’est pas une valeur possible pour « type »</b> : valeurs possibles : success, error, info, warning. ' +
    'Tant que ce n’est pas corrigé, le site affiche ce composant en texte brut.</div></div>',
    '<span>＋ Insérer un composant</span><span class="bad">⛔ 1 point à corriger</span><span>👁 Aperçu DSFR</span>'),
  '5-reglages': chip(5, 'Réglez l’affichage à votre goût') + window_('Paramètres — Aperçu DSFR', '<div class="act"></div><div class="set"><h3>Aperçu DSFR</h3>' +
    '<div class="row"><b>Thème de l’aperçu</b><span>Clair, sombre, ou comme VS Code</span><br><span class="sel2">auto ▾</span></div>' +
    '<div class="row"><b>Mise en page</b><span>La page entière comme sur le site, ou le contenu seul</span><br><span class="sel2">site ▾</span></div>' +
    '<div class="row"><span class="cb">✓</span><b style="display:inline">Couleurs DSFR dans l’éditeur</b><br><span>« /// » en rouge, nom du bloc en bleu, titre en vert</span></div>' +
    '<div class="row"><span class="cb" style="background:#fff;border:1px solid #999"></span><b style="display:inline">Largeur d’un ordinateur</b><br><span>Les cartes passent à la ligne comme sur le site</span></div></div>'),
};

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const scene = /^\/scene\/(.+)$/.exec(name);
  if (scene) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + SCENES[scene[1]] + '</body></html>');
  }
  fs.readFile(path.join(ROOT, name), (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : name.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
    res.end(d);
  });
}).listen(0, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1.5 });
  for (const id of Object.keys(SCENES)) {
    await page.goto('http://127.0.0.1:' + server.address().port + '/scene/' + id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, id + '.png') });
    console.log('→ media/walkthrough/' + id + '.png');
  }
  await browser.close();
  server.close();
});
