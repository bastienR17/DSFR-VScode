'use strict';
/**
 * Point d'entrée de l'extension VS Code.
 *
 * L'extension s'appuie sur l'aperçu Markdown intégré à VS Code au lieu de créer le sien :
 *   - `extendMarkdownIt` ajoute le plugin DSFR au moteur markdown-it de l'aperçu
 *     (déclaré par "markdown.markdownItPlugins" dans package.json) ;
 *   - les feuilles de style DSFR et le script media/dsfr-preview.js sont injectés dans
 *     l'aperçu par "markdown.previewStyles" et "markdown.previewScripts".
 *
 * Ce fichier ajoute les réglages, l'indicateur de la barre d'état, les commandes, et le
 * contrôle de la page dans l'éditeur : les problèmes affichés dans l'aperçu (blocs DSFR mal
 * écrits, en-tête YAML illisible…) sont aussi soulignés dans le Markdown, avec une ampoule de
 * correction rapide quand c'est possible. Seuls les fichiers ouverts sont analysés.
 *
 * Aperçu DSFR pour Markdown — créé par Bastien (bastienR17), licence MIT.
 */
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const dsfrPlugin = require('./lib/dsfr-markdown-it');
const { analyzeFrontMatter, fixFrontMatter, describeError } = require('./lib/frontmatter');
const { createLinter } = require('./lib/lint');
const assist = require('./lib/assist');
const { checkLinks } = require('./lib/links');
const mkdocsConfig = require('./lib/mkdocs-config');
const { checkQuality } = require('./lib/quality');
const { foldingRanges } = require('./lib/folding');
const { DOC_SIRH } = require('./lib/site-frame');
const { buildMenu, headerPlacement } = require('./lib/component-menu');
const { blockDecorations, COLORS } = require('./lib/decorations');

const SECTION = 'dsfrPreview';
let statusItem = null;
// Compteur des problèmes de la page ouverte (barre d'état) ; un clic les liste.
let problemsItem = null;
// Bouton « Insérer un composant » de la barre d'état
let insertItem = null;

function config() {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: c.get('enabled', true),
    theme: c.get('theme', 'auto'),
    showErrors: c.get('showErrors', true),
    mkdocsCompat: c.get('mkdocsCompat', true),
    openMode: c.get('openMode', 'side'),
    checkLinks: c.get('checkLinks', true),
    checkImageAlt: c.get('checkImageAlt', true),
    siteUrl: c.get('siteUrl', 'https://docsirh.e2.rie.gouv.fr'),
    pageLayout: c.get('pageLayout', 'site'),
    desktopWidth: c.get('desktopWidth', false),
    colors: c.get('colors', true),
    autoOpen: c.get('autoOpen', true),
    siteBrand: c.get('siteBrand', DOC_SIRH.intitule),
    siteTitle: c.get('siteTitle', DOC_SIRH.titre),
    siteTagline: c.get('siteTagline', DOC_SIRH.sousTitre),
  };
}

function isEnabled() {
  return config().enabled;
}

/**
 * Modifie `dsfrPreview.enabled` là où il est réellement défini (dossier, espace de travail
 * ou utilisateur). Écrire seulement dans les réglages utilisateur serait sans effet si un
 * réglage d'espace de travail l'emporte.
 */
async function setEnabled(value) {
  const c = vscode.workspace.getConfiguration(SECTION);
  const where = c.inspect('enabled') || {};
  let target = vscode.ConfigurationTarget.Global;
  if (where.workspaceFolderValue !== undefined) target = vscode.ConfigurationTarget.WorkspaceFolder;
  else if (where.workspaceValue !== undefined) target = vscode.ConfigurationTarget.Workspace;
  await c.update('enabled', value, target);
}

// Les plugins markdown-it sont relus à chaque rendu : un rafraîchissement suffit.
function refreshPreview() {
  vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => {});
}

// Indicateur « DSFR » de la barre d'état, visible pour les fichiers Markdown.
function updateStatus() {
  if (!statusItem) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    statusItem.hide();
    return;
  }
  const on = isEnabled();
  statusItem.text = on ? '$(eye) Aperçu DSFR' : '$(eye-closed) Aperçu DSFR coupé';
  statusItem.tooltip = (on ? 'Aperçu DSFR actif' : 'Aperçu DSFR coupé : l\'aperçu standard de VS Code est affiché') + ' — cliquer pour basculer';
  statusItem.show();
  if (insertItem) {
    if (on) insertItem.show(); else insertItem.hide();
  }
}

/**
 * Fichier Markdown visé par une commande d'ouverture : celui cliqué dans l'explorateur ou
 * sur un onglet, sinon celui de l'éditeur actif. Affiche un message et renvoie null s'il n'y en a pas.
 * Active aussi le rendu DSFR s'il était coupé : ouvrir l'aperçu DSFR, c'est vouloir le voir.
 * @param {vscode.Uri} [uri]
 */
async function previewTarget(uri) {
  const editor = vscode.window.activeTextEditor;
  const target = uri instanceof vscode.Uri
    ? uri
    : (editor && editor.document.languageId === 'markdown' ? editor.document.uri : null);
  if (!target) {
    vscode.window.showWarningMessage('Ouvrez d\'abord un fichier Markdown pour afficher son aperçu DSFR.');
    return null;
  }
  if (!isEnabled()) await setEnabled(true);
  return target;
}

/**
 * Commande « Ouvrir l'aperçu DSFR à côté » : l'écran est partagé en deux, le Markdown
 * à gauche et l'aperçu à droite, et le curseur reste dans le Markdown pour continuer à écrire.
 * @param {vscode.Uri} [uri] fichier cliqué dans l'explorateur ou sur un onglet
 */
async function openToSide(uri) {
  const target = await previewTarget(uri);
  if (!target) return;

  // 1) Le Markdown, à gauche : là où il est déjà affiché, sinon dans la première colonne.
  const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === target.toString());
  const column = visible ? visible.viewColumn : vscode.ViewColumn.One;
  const editor = await vscode.window.showTextDocument(target, { viewColumn: column, preview: false });

  // 2) L'aperçu, dans la colonne juste à droite (« Beside » de la colonne active).
  await vscode.commands.executeCommand('markdown.showPreviewToSide', target);

  // 3) VS Code donne le focus à l'aperçu : on le rend à l'éditeur.
  await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preview: false });
}

/**
 * Commande « Ouvrir l'aperçu DSFR dans une nouvelle fenêtre ».
 * Ouvre l'aperçu puis le déplace dans une fenêtre flottante (VS Code 1.85 ou plus) ;
 * l'aperçu suit ensuite le fichier Markdown actif. Sur une version plus ancienne,
 * la commande de déplacement n'existe pas : l'aperçu s'ouvre à côté de l'éditeur.
 * @param {vscode.Uri} [uri] fichier cliqué dans l'explorateur ou sur un onglet
 */
async function openInNewWindow(uri) {
  const target = await previewTarget(uri);
  if (!target) return;
  await vscode.commands.executeCommand('markdown.showPreview', target);
  try {
    await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
  } catch (e) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await openToSide(target);
    vscode.window.showInformationMessage('Votre version de VS Code ne permet pas d\'ouvrir l\'aperçu dans une fenêtre séparée (VS Code 1.85 minimum) : il est affiché à côté de l\'éditeur.');
  }
}

/**
 * Commande « Ouvrir l'aperçu DSFR » (bouton de la barre de titre, Ctrl+Alt+D) :
 * à côté de l'éditeur ou dans une nouvelle fenêtre, selon le réglage dsfrPreview.openMode.
 * @param {vscode.Uri} [uri]
 */
function open(uri) {
  return config().openMode === 'window' ? openInNewWindow(uri) : openToSide(uri);
}

/* ------------------------------------------------------------------ */
/* Problèmes de la page : soulignements dans l'éditeur et corrections  */
/* ------------------------------------------------------------------ */

// Code des diagnostics qu'une correction rapide sait réparer (valeur contenant « : »).
const FIX_CODE = 'dsfr-frontmatter-colon';
const EXCLUDED_DIRS = '**/{node_modules,.git,site,venv,.venv}/**';
// Délai après la dernière frappe avant de réanalyser la page (ms).
const LINT_DELAY = 300;
let diagnostics = null;
const lintTimers = new Map();
// Analyse des blocs DSFR : le même plugin que l'aperçu, avec un markdown-it privé (lib/lint.js).
const lintBlocks = createLinter({ mkdocsCompat: () => config().mkdocsCompat });

const SEVERITY = () => ({
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
});

// Problème trouvé par lib/ (lint, links, mkdocs-config) → soulignement VS Code.
const toDiagnostic = (issue) => {
  const r = issue.range;
  const d = new vscode.Diagnostic(new vscode.Range(r.line, r.start, r.line, r.end), issue.message, SEVERITY()[issue.severity]);
  d.code = issue.code;
  d.source = 'DSFR';
  return d;
};

/** En-tête YAML illisible : les lignes que l'on sait corriger sont soulignées une par une. */
function frontMatterDiagnostics(document, text) {
  const info = analyzeFrontMatter(text);
  if (!info || !info.error) return [];
  if (info.fixes.length) {
    return info.fixes.map((f) => {
      const d = new vscode.Diagnostic(document.lineAt(f.line).range, describeError(Object.assign({}, info, { fixes: [f] })), vscode.DiagnosticSeverity.Error);
      d.code = FIX_CODE;
      d.source = 'DSFR';
      return d;
    });
  }
  const d = new vscode.Diagnostic(document.lineAt(Math.min(info.errorLine, document.lineCount - 1)).range, describeError(info), vscode.DiagnosticSeverity.Error);
  d.source = 'DSFR';
  return [d];
}

/** Blocs « /// », bandeau, fil d'Ariane, listes : les mêmes problèmes que dans l'aperçu. */
function blockDiagnostics(text) {
  return lintBlocks(text).map((issue) => toDiagnostic(issue));
}

/* --- mkdocs.yml du site (facultatif) : relu seulement s'il a changé ------------------- */
const configCache = new Map(); // chemin → { mtime, config }
function siteConfig(file, workspaceRoot) {
  const configPath = mkdocsConfig.findConfig(path.dirname(file), workspaceRoot, (p) => fs.existsSync(p));
  if (!configPath) return null;
  try {
    const mtime = fs.statSync(configPath).mtimeMs;
    const cached = configCache.get(configPath);
    if (cached && cached.mtime === mtime) return cached.config;
    const config = mkdocsConfig.parseConfig(fs.readFileSync(configPath, 'utf8'), configPath);
    configCache.set(configPath, { mtime, config });
    return config;
  } catch (e) {
    return null;
  }
}

/**
 * Réglages de la mise en page « comme le site » pour la page affichée dans l'aperçu, ou null si le
 * réglage dsfrPreview.pageLayout vaut « content ». Les textes de l'en-tête et du pied de page viennent
 * du mkdocs.yml du site s'il est trouvé, sinon des réglages de l'extension.
 */
function siteFrameFor(env) {
  const c = config();
  if (c.pageLayout !== 'site') return null;
  const doc = env && env.currentDocument;
  const file = doc && doc.scheme === 'file' ? doc.fsPath : null;
  let theme = null;
  if (file) {
    const folder = vscode.workspace.getWorkspaceFolder ? vscode.workspace.getWorkspaceFolder(doc) : null;
    const site = siteConfig(file, folder ? folder.uri.fsPath : null);
    theme = site && site.theme ? site.theme : null;
  }
  // Sans mkdocs.yml : en-tête, menu et pied de page de Doc SIRH (bloc-marque, titre et sous-titre réglables)
  const base = theme ? {} : Object.assign({}, DOC_SIRH, { intitule: c.siteBrand, titre: c.siteTitle, sousTitre: c.siteTagline });
  return Object.assign(base, theme || {}, { desktop: !!c.desktopWidth, path: file || '' });
}

const isInside = (file, dir) => {
  const rel = path.relative(dir, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * Liens et images de la page, et syntaxes non activées dans le mkdocs.yml (fichiers locaux seulement).
 * Une autre page déjà ouverte est lue telle qu'affichée, même non enregistrée.
 */
function siteDiagnostics(document, text) {
  if (document.uri.scheme !== 'file' || !config().checkLinks) return [];
  const file = document.uri.fsPath;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const site = siteConfig(file, folder ? folder.uri.fsPath : null);
  const inSite = !!site && isInside(file, site.docsDir);
  const read = (p) => {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === p);
    if (open) return open.getText();
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
  };
  const issues = checkLinks(text, { file, docsDir: inSite ? site.docsDir : null, exists: (p) => fs.existsSync(p), read });
  if (inSite) issues.push(...mkdocsConfig.checkExtensions(text, site));
  return issues.map(toDiagnostic);
}

/**
 * Conseils discrets (niveau information) : images sans description, liens absolus vers le site.
 * L'adresse du site vient du mkdocs.yml (site_url) s'il existe, sinon du réglage dsfrPreview.siteUrl
 * (réglage vide : vérification coupée).
 */
function qualityIssues(document, text) {
  const c = config();
  const local = document.uri.scheme === 'file';
  const file = local ? document.uri.fsPath : null;
  const folder = local ? vscode.workspace.getWorkspaceFolder(document.uri) : null;
  const site = local ? siteConfig(file, folder ? folder.uri.fsPath : null) : null;
  const inSite = !!site && isInside(file, site.docsDir);
  return checkQuality(text, {
    checkAlt: c.checkImageAlt,
    // Réglage vidé : pas de vérification, même si le mkdocs.yml déclare un site_url
    siteUrl: c.checkLinks && String(c.siteUrl || '').trim() ? ((inSite && site.siteUrl) || c.siteUrl) : '',
    file,
    docsDir: inSite ? site.docsDir : null,
    exists: (p) => fs.existsSync(p),
  });
}

const qualityDiagnostics = (document, text) => qualityIssues(document, text).map(toDiagnostic);

// Documents analysés : fichiers et brouillons, pas les copies ouvertes par Git (comparaisons) ou d'autres extensions.
const LINTED_SCHEMES = new Set(['file', 'untitled', 'vscode-remote', 'vscode-vfs']);

/** Analyse un document Markdown ouvert et met à jour ses soulignements. */
function lintDocument(document) {
  if (!diagnostics || document.languageId !== 'markdown' || !LINTED_SCHEMES.has(document.uri.scheme)) return;
  if (!isEnabled() || !config().showErrors) {
    diagnostics.delete(document.uri);
    return;
  }
  const text = document.getText();
  diagnostics.set(document.uri, frontMatterDiagnostics(document, text).concat(blockDiagnostics(text), siteDiagnostics(document, text), qualityDiagnostics(document, text)));
}

// Pendant la frappe, on attend une courte pause avant de réanalyser.
function scheduleLint(document) {
  if (document.languageId !== 'markdown') return;
  const key = document.uri.toString();
  clearTimeout(lintTimers.get(key));
  lintTimers.set(key, setTimeout(() => {
    lintTimers.delete(key);
    lintDocument(document);
    decorateDocument(document);
  }, LINT_DELAY));
}

/* --- Couleurs DSFR des blocs « /// » (lib/decorations.js) ------------------------------- */
let decorationTypes = null;
function createDecorationTypes() {
  const color = (k, extra) => vscode.window.createTextEditorDecorationType(Object.assign({
    light: { color: COLORS[k].light }, dark: { color: COLORS[k].dark },
  }, extra || {}));
  return {
    fence: color('fence', { fontWeight: 'bold' }),
    name: color('name', { fontWeight: 'bold' }),
    title: color('title'),
    key: color('key'),
    band: vscode.window.createTextEditorDecorationType({
      isWholeLine: true, light: { backgroundColor: COLORS.band.light }, dark: { backgroundColor: COLORS.band.dark },
    }),
  };
}
function decorateEditor(editor) {
  if (!decorationTypes || !editor || !editor.setDecorations || editor.document.languageId !== 'markdown') return;
  const c = config();
  const d = c.enabled && c.colors
    ? blockDecorations(editor.document.getText().split('\n'))
    : { fence: [], name: [], title: [], key: [], band: [] };
  const range = (r) => new vscode.Range(r.line, r.start, r.line, r.end);
  for (const k of ['fence', 'name', 'title', 'key']) editor.setDecorations(decorationTypes[k], d[k].map(range));
  editor.setDecorations(decorationTypes.band, d.band.map((l) => new vscode.Range(l, 0, l, 0)));
}
function decorateDocument(document) {
  for (const e of vscode.window.visibleTextEditors || []) if (e.document === document) decorateEditor(e);
}
const decorateVisible = () => { for (const e of vscode.window.visibleTextEditors || []) decorateEditor(e); };

/* --- Ouverture automatique de l'aperçu (réglage dsfrPreview.autoOpen) -------------------
 * À la première page Markdown ouverte dans la fenêtre, l'aperçu DSFR s'ouvre à côté, une seule fois :
 * s'il est fermé ensuite, il ne revient pas tout seul (l'aperçu suit de toute façon la page active).
 */
let autoOpened = false;
function previewIsOpen() {
  const groups = (vscode.window.tabGroups && vscode.window.tabGroups.all) || [];
  return groups.some((g) => g.tabs.some((t) => t.input && /markdown\.preview/i.test(String(t.input.viewType || ''))));
}
function maybeAutoOpen(editor) {
  if (autoOpened || !editor || editor.document.languageId !== 'markdown') return;
  const c = config();
  if (!c.autoOpen || !c.enabled) return;
  autoOpened = true;
  if (previewIsOpen()) return;
  Promise.resolve(open(editor.document.uri)).catch(() => {});
}

function forgetDocument(document) {
  const key = document.uri.toString();
  clearTimeout(lintTimers.get(key));
  lintTimers.delete(key);
  if (diagnostics) diagnostics.delete(document.uri);
}

function lintOpenDocuments() {
  for (const document of vscode.workspace.textDocuments) lintDocument(document);
}

// Le diagnostic de `list` qui correspond à un problème (même code, même ligne).
const diagnosticFor = (list, issue) => list.filter((d) => d.code === issue.code && d.range.start.line === issue.range.line);

/**
 * Ampoule : corrections rapides des problèmes situés dans la plage demandée.
 *  - en-tête YAML illisible : mettre les valeurs entre guillemets (ce fichier ou tout le dossier) ;
 *  - blocs DSFR : corrections proposées par lib/lint.js (valeur la plus proche, bloc à fermer…).
 */
const codeActionProvider = {
  provideCodeActions(document, range, context) {
    const actions = [];
    const relevant = context.diagnostics.filter((d) => d.code === FIX_CODE);
    const fixed = relevant.length ? fixFrontMatter(document.getText()) : null;
    if (fixed) {
      const fixThis = new vscode.CodeAction('Mettre entre guillemets les valeurs qui contiennent « : »', vscode.CodeActionKind.QuickFix);
      fixThis.edit = new vscode.WorkspaceEdit();
      for (const f of fixed.fixes) fixThis.edit.replace(document.uri, document.lineAt(f.line).range, f.after);
      fixThis.diagnostics = relevant;
      fixThis.isPreferred = true;

      const fixAll = new vscode.CodeAction('Corriger les en-têtes de page (entre les ---) de tous les fichiers du dossier…', vscode.CodeActionKind.QuickFix);
      fixAll.command = { command: 'dsfrPreview.fixFrontMatterInWorkspace', title: fixAll.title };
      fixAll.diagnostics = relevant;
      actions.push(fixThis, fixAll);
    }

    // Problèmes de blocs : on réanalyse le texte affiché pour retrouver les corrections possibles.
    // Rien n'est modifié sans un clic de l'utilisateur sur une correction précise.
    if (!context.diagnostics.some((d) => d.source === 'DSFR' && d.code !== FIX_CODE)) return actions;
    const text = document.getText();
    for (const issue of lintBlocks(text).concat(qualityIssues(document, text))) {
      if (!issue.fixes.length || issue.range.line < range.start.line || issue.range.line > range.end.line) continue;
      const linked = diagnosticFor(context.diagnostics, issue);
      if (!linked.length) continue;
      for (const fix of issue.fixes) {
        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        for (const e of fix.edits) {
          action.edit.replace(document.uri, new vscode.Range(e.start.line, e.start.character, e.end.line, e.end.character), e.text);
        }
        action.diagnostics = linked;
        action.isPreferred = !!fix.preferred;
        actions.push(action);
      }
    }
    return actions;
  },
};

/* --- Localiser les problèmes de la page ------------------------------------------------ */

const plural = (n, word) => n + ' ' + word + (n > 1 ? 's' : '');

/** Problèmes DSFR de la page, triés par ligne (ceux du panneau Problèmes). */
function pageProblems(document) {
  lintDocument(document);
  const list = (diagnostics && diagnostics.get(document.uri)) || [];
  return list.slice().sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
}

/**
 * État de la page dans la barre d'état, en couleur : « Page sans erreur » (vert), « N points à vérifier »
 * (fond orange) ou « N points à corriger » (fond rouge). Un clic liste les points avec leur ligne.
 */
function updateProblemsCount() {
  if (!problemsItem) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown' || !isEnabled()) {
    problemsItem.hide();
    return;
  }
  // Seuls les erreurs et avertissements sont comptés (pas les conseils « information »).
  const list = (diagnostics ? diagnostics.get(editor.document.uri) || [] : [])
    .filter((d) => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning);
  const errors = list.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
  if (!list.length) {
    problemsItem.text = '$(pass-filled) Page sans erreur';
    problemsItem.tooltip = 'Aucun point à corriger dans cette page';
    problemsItem.color = new vscode.ThemeColor('testing.iconPassed');
    problemsItem.backgroundColor = undefined;
  } else {
    problemsItem.text = (errors ? '$(error) ' : '$(warning) ') + plural(list.length, 'point') + (errors ? ' à corriger' : ' à vérifier');
    problemsItem.tooltip = 'Cliquer pour voir la liste, avec la ligne de chaque point (un clic sur un point y place le curseur)';
    problemsItem.color = undefined;
    problemsItem.backgroundColor = new vscode.ThemeColor(errors ? 'statusBarItem.errorBackground' : 'statusBarItem.warningBackground');
  }
  problemsItem.show();
}

/**
 * Commande « Insérer un composant » : liste des composants par familles, avec une explication ;
 * le composant choisi est inséré au curseur (les clés de l'en-tête de page vont dans l'en-tête).
 */
async function insertComponent() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Ouvrez d\'abord une page Markdown (fichier .md), puis placez le curseur là où insérer le composant.');
    return;
  }
  const menu = buildMenu(require('./snippets/dsfr.json'));
  const items = menu.map((m) => (m.separator
    ? { label: m.label, kind: vscode.QuickPickItemKind.Separator }
    : { label: '$(' + m.icon + ') ' + m.label, description: m.description, detail: m.detail, item: m }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Insérer un composant DSFR',
    placeHolder: 'Choisissez un composant (tapez pour chercher : alerte, carte, capture…)',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked || !picked.item) return;
  const doc = editor.document;
  const place = headerPlacement(doc.getText().split('\n').map((l) => l.replace(/\r$/, '')), picked.item);
  if (place && place.error) {
    vscode.window.showInformationMessage(place.error);
    return;
  }
  const at = place ? new vscode.Position(place.line, place.character) : undefined;
  await editor.insertSnippet(new vscode.SnippetString(place ? place.text : picked.item.body), at);
}

/**
 * Commande « DSFR : Problèmes de la page » : liste les problèmes de la page ouverte avec leur
 * ligne ; en choisir un place le curseur dessus. Rien n'est modifié dans la page.
 * @param {vscode.Uri} [uri]
 */
async function listProblems(uri) {
  const editor = vscode.window.activeTextEditor;
  let document = editor && editor.document.languageId === 'markdown' ? editor.document : null;
  if (uri instanceof vscode.Uri) document = await vscode.workspace.openTextDocument(uri);
  if (!document) {
    vscode.window.showWarningMessage('Ouvrez d\'abord un fichier Markdown.');
    return;
  }
  const problems = pageProblems(document);
  if (!problems.length) {
    vscode.window.showInformationMessage('Aucun point à corriger dans cette page.');
    return;
  }
  const S = vscode.DiagnosticSeverity;
  const icon = (d) => (d.severity === S.Error ? '$(error)' : d.severity === S.Warning ? '$(warning)' : '$(info)');
  const tips = problems.filter((d) => d.severity !== S.Error && d.severity !== S.Warning).length;
  const real = problems.length - tips;
  const items = problems.map((d) => ({
    label: icon(d) + ' Ligne ' + (d.range.start.line + 1),
    description: (document.lineAt(d.range.start.line).text || '').trim().slice(0, 60),
    detail: d.message,
    diagnostic: d,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: [real ? plural(real, 'point') + ' à corriger' : '', tips ? plural(tips, 'conseil') : ''].filter(Boolean).join(' et ') + ' dans cette page',
    placeHolder: 'Choisir un problème pour aller à sa ligne',
    matchOnDetail: true,
  });
  if (!picked) return;
  const shown = await vscode.window.showTextDocument(document, { preview: false });
  const r = picked.diagnostic.range;
  shown.selection = new vscode.Selection(r.start.line, r.start.character, r.end.line, r.end.character);
  shown.revealRange(r, vscode.TextEditorRevealType.InCenter);
}

/**
 * Commande « Corriger les en-têtes YAML des fichiers Markdown » : parcourt le dossier ouvert,
 * met entre guillemets les valeurs qui contiennent « : », après confirmation, puis enregistre.
 * Les modifications passent par l'éditeur : elles s'annulent fichier par fichier (Ctrl+Z).
 */
async function fixFrontMatterInWorkspace() {
  const files = await vscode.workspace.findFiles('**/*.{md,markdown}', EXCLUDED_DIRS);
  const todo = [];
  for (const uri of files) {
    // Fichier ouvert : on part du texte affiché (éventuellement non enregistré)
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    const text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const fixed = fixFrontMatter(text);
    if (fixed) todo.push({ uri, fixes: fixed.fixes });
  }
  if (!todo.length) {
    vscode.window.showInformationMessage('Aucun en-tête de page à corriger dans les ' + files.length + ' fichiers Markdown du dossier.');
    return;
  }

  const lineCount = todo.reduce((n, t) => n + t.fixes.length, 0);
  const preview = todo.slice(0, 8).map((t) => '• ' + vscode.workspace.asRelativePath(t.uri)).join('\n') +
    (todo.length > 8 ? '\n• … et ' + (todo.length - 8) + ' autres' : '');
  const answer = await vscode.window.showWarningMessage(
    lineCount + ' ligne(s) d\'en-tête à corriger dans ' + todo.length + ' fichier(s)',
    { modal: true, detail: 'Les valeurs qui contiennent « : » seront mises entre guillemets, par exemple :\n' + todo[0].fixes[0].after.trim() + '\n\n' + preview },
    'Corriger'
  );
  if (answer !== 'Corriger') return;

  const edit = new vscode.WorkspaceEdit();
  for (const t of todo) {
    for (const f of t.fixes) edit.replace(t.uri, new vscode.Range(f.line, 0, f.line, f.before.length), f.after);
  }
  if (!(await vscode.workspace.applyEdit(edit))) {
    vscode.window.showErrorMessage('Les en-têtes n\'ont pas pu être corrigés.');
    return;
  }
  for (const t of todo) {
    const document = await vscode.workspace.openTextDocument(t.uri);
    await document.save();
  }
  vscode.window.showInformationMessage(todo.length + ' fichier(s) corrigé(s).');
}

/* ------------------------------------------------------------------ */
/* Autocomplétion et aide au survol des blocs DSFR (lib/assist.js)     */
/* ------------------------------------------------------------------ */

const COMPLETION_KIND = () => ({
  block: vscode.CompletionItemKind.Module,
  option: vscode.CompletionItemKind.Property,
  value: vscode.CompletionItemKind.Value,
  snippet: vscode.CompletionItemKind.Snippet,
});

function createAssistProviders(context) {
  const media = (...p) => context.asAbsolutePath(path.join('media', 'dsfr', ...p));
  const assets = {
    artworkDir: media('artwork', 'pictograms'),
    cssFiles: [media('dsfr.min.css'), media('utility', 'utility.min.css')],
    snippets: require('./snippets/dsfr.json'),
  };
  const linesOf = (document) => document.getText().split('\n').map((l) => l.replace(/\r$/, ''));

  const completion = {
    provideCompletionItems(document, position, token, context) {
      if (!isEnabled()) return undefined;
      // Ctrl+Espace : VS Code propose déjà les snippets « dsfr- » ; on ne les ajoute qu'à la frappe du « - ».
      const invoked = !!context && context.triggerKind === vscode.CompletionTriggerKind.Invoke;
      const r = assist.completions(linesOf(document), position.line, position.character, assets, { snippets: !invoked });
      if (!r) return undefined;
      const range = new vscode.Range(position.line, r.from, position.line, position.character);
      return r.items.map((it, i) => {
        const item = new vscode.CompletionItem(it.label, COMPLETION_KIND()[it.kind]);
        item.insertText = it.snippet ? new vscode.SnippetString(it.insertText) : it.insertText;
        item.range = range;
        item.sortText = String(i).padStart(4, '0'); // ordre de options.js (le plus courant d'abord)
        if (it.detail) item.detail = it.detail;
        if (it.documentation) item.documentation = new vscode.MarkdownString(it.documentation);
        if (it.filterText) item.filterText = it.filterText;
        if (it.retrigger) item.command = { command: 'editor.action.triggerSuggest', title: 'Valeurs possibles' };
        return item;
      });
    },
  };

  const hover = {
    provideHover(document, position) {
      if (!isEnabled()) return undefined;
      const h = assist.hover(linesOf(document), position.line, position.character);
      if (!h) return undefined;
      return new vscode.Hover(new vscode.MarkdownString(h.markdown), new vscode.Range(h.range.line, h.range.start, h.range.line, h.range.end));
    },
  };
  return { completion, hover };
}

// Commande « Activer / désactiver l'aperçu DSFR » (aussi déclenchée par l'indicateur).
async function toggle() {
  const on = isEnabled();
  await setEnabled(!on);
  vscode.window.showInformationMessage(on ? 'Aperçu DSFR désactivé.' : 'Aperçu DSFR activé.');
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'dsfrPreview.toggle';
  problemsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  problemsItem.command = 'dsfrPreview.listProblems';
  insertItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  insertItem.command = 'dsfrPreview.insertComponent';
  insertItem.text = '$(add) Insérer un composant';
  insertItem.tooltip = 'Insérer un composant DSFR (alerte, carte, capture…) à l\'endroit du curseur';
  const providers = createAssistProviders(context);

  context.subscriptions.push(
    statusItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        refreshPreview();
        updateStatus();
        updateProblemsCount();
        decorateVisible();
        lintOpenDocuments();
      }
    }),
    insertItem,
    vscode.window.onDidChangeActiveTextEditor((editor) => { updateStatus(); updateProblemsCount(); decorateEditor(editor); maybeAutoOpen(editor); }),
    vscode.window.onDidChangeVisibleTextEditors ? vscode.window.onDidChangeVisibleTextEditors(decorateVisible) : { dispose() {} },
    vscode.commands.registerCommand('dsfrPreview.insertComponent', insertComponent),
    vscode.commands.registerCommand('dsfrPreview.toggle', toggle),
    vscode.commands.registerCommand('dsfrPreview.open', open),
    vscode.commands.registerCommand('dsfrPreview.openToSide', openToSide),
    vscode.commands.registerCommand('dsfrPreview.openInNewWindow', openInNewWindow),
    vscode.commands.registerCommand('dsfrPreview.fixFrontMatterInWorkspace', fixFrontMatterInWorkspace),
    vscode.commands.registerCommand('dsfrPreview.listProblems', listProblems),
    problemsItem,
    vscode.languages.onDidChangeDiagnostics(updateProblemsCount),
    diagnostics = vscode.languages.createDiagnosticCollection('dsfr'),
    vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, codeActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.languages.registerCompletionItemProvider({ language: 'markdown' }, providers.completion, '/', ' ', ':', '-'),
    vscode.languages.registerHoverProvider({ language: 'markdown' }, providers.hover),
    // Repli des blocs « /// » (flèches dans la marge), en plus des titres et listes repliés par VS Code
    vscode.languages.registerFoldingRangeProvider({ language: 'markdown' }, {
      provideFoldingRanges(document) {
        if (!config().enabled) return [];
        return foldingRanges(document.getText().split('\n')).map((r) => new vscode.FoldingRange(r.start, r.end));
      },
    }),
    vscode.workspace.onDidOpenTextDocument(lintDocument),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleLint(e.document)),
    vscode.workspace.onDidCloseTextDocument(forgetDocument),
    // Un fichier enregistré (autre page, image renommée, mkdocs.yml…) peut changer les liens des pages ouvertes.
    vscode.workspace.onDidSaveTextDocument(() => lintOpenDocuments()),
    { dispose: () => { for (const t of lintTimers.values()) clearTimeout(t); lintTimers.clear(); } }
  );
  decorationTypes = createDecorationTypes();
  for (const t of Object.values(decorationTypes)) context.subscriptions.push(t);
  decorateVisible();
  maybeAutoOpen(vscode.window.activeTextEditor);
  updateStatus();
  lintOpenDocuments();

  // API lue par l'extension Markdown de VS Code. Les options sont des fonctions :
  // les réglages sont relus à chaque rendu, sans recharger la fenêtre.
  return {
    extendMarkdownIt(md) {
      return dsfrPlugin(md, {
        isEnabled,
        features: () => ({ dsfr: isEnabled(), admonition: true, details: true, mkdocs: isEnabled() && config().mkdocsCompat }),
        showErrors: () => config().showErrors,
        theme: () => config().theme,
        site: siteFrameFor,
        artworkDir: context.asAbsolutePath(path.join('media', 'dsfr', 'artwork', 'pictograms')),
      });
    },
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
