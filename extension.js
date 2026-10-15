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
 * contrôle des en-têtes YAML dans l'éditeur (soulignement, ampoule de correction rapide).
 */
const vscode = require('vscode');
const path = require('path');
const dsfrPlugin = require('./lib/dsfr-markdown-it');
const { analyzeFrontMatter, fixFrontMatter, describeError } = require('./lib/frontmatter');

const SECTION = 'dsfrPreview';
let statusItem = null;

function config() {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: c.get('enabled', true),
    theme: c.get('theme', 'auto'),
    showErrors: c.get('showErrors', true),
    mkdocsCompat: c.get('mkdocsCompat', true),
    openMode: c.get('openMode', 'side'),
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
  statusItem.text = on ? '$(eye) DSFR' : '$(eye-closed) DSFR';
  statusItem.tooltip = (on ? 'Aperçu DSFR actif' : 'Aperçu DSFR désactivé') + ' — cliquer pour basculer';
  statusItem.show();
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
/* En-têtes YAML : erreurs dans l'éditeur et correction               */
/* ------------------------------------------------------------------ */

// Code des diagnostics qu'une correction rapide sait réparer (valeur contenant « : »).
const FIX_CODE = 'dsfr-frontmatter-colon';
const EXCLUDED_DIRS = '**/{node_modules,.git,site,venv,.venv}/**';
let diagnostics = null;

/**
 * Souligne l'en-tête YAML s'il est illisible (même analyse que l'aperçu). Les lignes que l'on
 * sait corriger sont soulignées une par une et proposent une correction rapide (ampoule).
 */
function lintDocument(document) {
  if (!diagnostics || document.languageId !== 'markdown') return;
  const info = isEnabled() && config().showErrors ? analyzeFrontMatter(document.getText()) : null;
  if (!info || !info.error) {
    diagnostics.delete(document.uri);
    return;
  }
  let list;
  if (info.fixes.length) {
    list = info.fixes.map((f) => {
      const d = new vscode.Diagnostic(document.lineAt(f.line).range, describeError(Object.assign({}, info, { fixes: [f] })), vscode.DiagnosticSeverity.Error);
      d.code = FIX_CODE;
      d.source = 'DSFR';
      return d;
    });
  } else {
    const d = new vscode.Diagnostic(document.lineAt(Math.min(info.errorLine, document.lineCount - 1)).range, describeError(info), vscode.DiagnosticSeverity.Error);
    d.source = 'DSFR';
    list = [d];
  }
  diagnostics.set(document.uri, list);
}

function lintOpenDocuments() {
  for (const document of vscode.workspace.textDocuments) lintDocument(document);
}

/** Ampoule sur une ligne d'en-tête fautive : corriger ce fichier, ou tous les fichiers du dossier. */
const codeActionProvider = {
  provideCodeActions(document, range, context) {
    const relevant = context.diagnostics.filter((d) => d.code === FIX_CODE);
    if (!relevant.length) return [];
    const fixed = fixFrontMatter(document.getText());
    if (!fixed) return [];

    const fixThis = new vscode.CodeAction('Mettre entre guillemets les valeurs qui contiennent « : »', vscode.CodeActionKind.QuickFix);
    fixThis.edit = new vscode.WorkspaceEdit();
    for (const f of fixed.fixes) fixThis.edit.replace(document.uri, document.lineAt(f.line).range, f.after);
    fixThis.diagnostics = relevant;
    fixThis.isPreferred = true;

    const fixAll = new vscode.CodeAction('Corriger les en-têtes YAML de tous les fichiers Markdown du dossier…', vscode.CodeActionKind.QuickFix);
    fixAll.command = { command: 'dsfrPreview.fixFrontMatterInWorkspace', title: fixAll.title };
    fixAll.diagnostics = relevant;
    return [fixThis, fixAll];
  },
};

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
    vscode.window.showInformationMessage('Aucun en-tête YAML à corriger dans les ' + files.length + ' fichiers Markdown du dossier.');
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

// Commande « Activer / désactiver l'aperçu DSFR » (aussi déclenchée par l'indicateur).
async function toggle() {
  const on = isEnabled();
  await setEnabled(!on);
  vscode.window.showInformationMessage(on ? 'Aperçu DSFR désactivé.' : 'Aperçu DSFR activé.');
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'dsfrPreview.toggle';

  context.subscriptions.push(
    statusItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        refreshPreview();
        updateStatus();
        lintOpenDocuments();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.commands.registerCommand('dsfrPreview.toggle', toggle),
    vscode.commands.registerCommand('dsfrPreview.open', open),
    vscode.commands.registerCommand('dsfrPreview.openToSide', openToSide),
    vscode.commands.registerCommand('dsfrPreview.openInNewWindow', openInNewWindow),
    vscode.commands.registerCommand('dsfrPreview.fixFrontMatterInWorkspace', fixFrontMatterInWorkspace),
    diagnostics = vscode.languages.createDiagnosticCollection('dsfr'),
    vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, codeActionProvider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(lintDocument),
    vscode.workspace.onDidChangeTextDocument((e) => lintDocument(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri))
  );
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
        artworkDir: context.asAbsolutePath(path.join('media', 'dsfr', 'artwork', 'pictograms')),
      });
    },
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
