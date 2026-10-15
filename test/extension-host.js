// Charge extension.js avec une imitation minimale de l'API vscode
const Module = require('module');
const path = require('path');
const fs = require('fs');
const settings = { enabled: true, theme: 'auto', showErrors: true };
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsfr-frontmatter-'));
const commands = {};
const workspaceSettings = {};
const updates = [];
const calls = [];
let oldVsCode = false;
class Uri { constructor(p) { this.fsPath = p; } toString() { return 'file://' + this.fsPath; } }
// Éditeurs affichés (colonne → document) et suivi du focus, pour vérifier la disposition côte à côte
const shown = [];
let focused = null;
// Diagnostics, ampoules et modifications de fichiers
const diagStore = new Map();
let codeActionProvider = null;
let modalAnswer;
const saved = [];
class Range { constructor(sl, sc, el, ec) { Object.assign(this, { sl, sc, el, ec }); } }
class Diagnostic { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } }
class CodeAction { constructor(title, kind) { Object.assign(this, { title, kind }); } }
class WorkspaceEdit {
  constructor() { this.entries = []; }
  replace(uri, range, text) { this.entries.push({ uri, range, text }); }
}
// Document texte minimal, comme vscode.TextDocument
function textDocument(uri, text) {
  const lines = text.split('\n');
  return {
    uri, languageId: 'markdown', lineCount: lines.length,
    getText: () => text,
    lineAt: (i) => ({ range: new Range(i, 0, i, lines[i].replace(/\r$/, '').length) }),
  };
}
const noop = () => ({ dispose() {} });
const vscode = {
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/tmp' } }],
    getConfiguration: () => ({
      get: (k, d) => (k in settings ? settings[k] : d),
      inspect: (k) => ({ globalValue: settings[k], workspaceValue: workspaceSettings[k] }),
      update: async (k, v, target) => {
        updates.push(target);
        if (target === 2) workspaceSettings[k] = v; else settings[k] = v;
        if (k in workspaceSettings && target === 2) settings[k] = v; // le réglage d'espace l'emporte
      },
    }),
    findFiles: async () => (fs.existsSync(tmp) ? fs.readdirSync(tmp).map((f) => new Uri(path.join(tmp, f))) : []),
    fs: { readFile: async (u) => fs.readFileSync(u.fsPath) },
    textDocuments: [],
    asRelativePath: (u) => path.basename(u.fsPath),
    onDidOpenTextDocument: noop,
    onDidChangeTextDocument: noop,
    onDidCloseTextDocument: noop,
    // Applique les remplacements de lignes directement sur le disque
    applyEdit: async (edit) => {
      for (const e of edit.entries) {
        const lines = fs.readFileSync(e.uri.fsPath, 'utf8').split('\n');
        const eol = lines[e.range.sl].endsWith('\r') ? '\r' : '';
        lines[e.range.sl] = lines[e.range.sl].slice(0, e.range.sc) + e.text + lines[e.range.sl].slice(e.range.ec).replace(/\r$/, '') + eol;
        fs.writeFileSync(e.uri.fsPath, lines.join('\n'));
      }
      return true;
    },
    openTextDocument: async (u) => ({ save: async () => { saved.push(path.basename(u.fsPath)); return true; } }),
    createFileSystemWatcher: () => ({ onDidCreate: noop, onDidChange: noop, onDidDelete: noop, dispose() {} }),
    onDidChangeWorkspaceFolders: noop,
    onDidChangeConfiguration: (fn) => { configListener = fn; return { dispose() {} }; },
  },
  window: {
    activeTextEditor: null,
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    onDidChangeActiveTextEditor: noop,
    showInformationMessage: async () => undefined,
    showWarningMessage: async (message, options) => (options && options.modal ? modalAnswer : undefined),
    showErrorMessage: async () => undefined,
    visibleTextEditors: [],
    showTextDocument: async (target, opts) => {
      const document = target.uri ? target : { uri: target, languageId: 'markdown' };
      const editor = { document, viewColumn: opts.viewColumn };
      shown.push({ uri: document.uri.toString(), column: opts.viewColumn, preserveFocus: !!opts.preserveFocus });
      if (!opts.preserveFocus) focused = 'editor:' + opts.viewColumn;
      return editor;
    },
  },
  commands: {
    registerCommand: (id, fn) => { commands[id] = fn; return { dispose() {} }; },
    executeCommand: async (id) => {
      calls.push(id);
      if (id === 'markdown.showPreviewToSide') focused = 'preview'; // comme VS Code : l'aperçu prend le focus
      if (id === 'workbench.action.moveEditorToNewWindow' && oldVsCode) throw new Error('command not found');
    },
  },
  languages: {
    createDiagnosticCollection: () => ({
      set: (uri, list) => diagStore.set(uri.toString(), list),
      delete: (uri) => diagStore.delete(uri.toString()),
      dispose() {},
    }),
    registerCodeActionsProvider: (selector, provider) => { codeActionProvider = provider; return { dispose() {} }; },
  },
  Range, Diagnostic, CodeAction, WorkspaceEdit,
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  CodeActionKind: { QuickFix: 'quickfix' },
  Uri,
  ViewColumn: { One: 1, Two: 2, Beside: -2 },
  StatusBarAlignment: { Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
};
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? vscode : orig.call(this, req, ...rest); };

// Diagnostics d'un document : on l'ouvre, puis on déclenche un changement de réglage,
// qui relance l'analyse de tous les documents ouverts.
let configListener = null;
async function lintVia(document) {
  vscode.workspace.textDocuments = [document];
  configListener({ affectsConfiguration: () => true });
  return diagStore.get(document.uri.toString()) || [];
}

(async () => {
  const ext = require('../extension.js');
  const ctx = { subscriptions: [], asAbsolutePath: (p) => path.join(__dirname, '..', p) };
  const api = await ext.activate(ctx);
  const MarkdownIt = require('markdown-it');
  const md = api.extendMarkdownIt(new MarkdownIt({ html: true }));
  const src = '/// alert | Test\n    type: success\nOK\n///\n\n!!! note\n    Encadré\n\n> Exergue\n';
  const assert = require('assert');
  // Chaque commande déclarée dans package.json (menus, raccourcis compris) est bien enregistrée
  const manifest = require('../package.json').contributes;
  const declared = new Set(manifest.commands.map((c) => c.command));
  for (const list of Object.values(manifest.menus)) for (const item of list) declared.add(item.command);
  for (const k of manifest.keybindings) declared.add(k.command);
  for (const id of declared) assert(commands[id], 'commande déclarée mais non enregistrée : ' + id);
  // Actif partout, même sans mkdocs.yml
  const other = md.render(src, { currentDocument: { fsPath: '/tmp/other/README.md' } });
  assert(other.includes('fr-alert fr-alert--success') && other.includes('data-enabled="true"'), other);
  assert(other.includes('admonition note') && other.includes('fr-highlight'), other);
  const noDoc = md.render(src, {});
  assert(noDoc.includes('fr-alert'), noDoc);
  // Bascule via la commande
  vscode.window.activeTextEditor = { document: { uri: { fsPath: '/tmp/other/README.md' }, languageId: 'markdown' } };
  await commands['dsfrPreview.toggle']();
  assert.strictEqual(settings.enabled, false);
  const off = md.render(src, { currentDocument: { fsPath: '/tmp/other/README.md' } });
  assert(!off.includes('fr-alert') && off.includes('data-enabled="false"'), off);
  await commands['dsfrPreview.toggle']();
  assert.strictEqual(settings.enabled, true);
  const doc = new Uri('/tmp/other/README.md');
  const others = (list) => list.filter((c) => c !== 'markdown.preview.refresh');

  // Ouverture par défaut (bouton, Ctrl+Alt+D) : écran partagé, Markdown à gauche, aperçu à droite
  vscode.window.activeTextEditor = { document: { uri: doc, languageId: 'markdown' } };
  calls.length = 0; shown.length = 0;
  await commands['dsfrPreview.open']();
  assert.deepStrictEqual(others(calls), ['markdown.showPreviewToSide']);
  assert.strictEqual(shown[0].column, 1, 'le Markdown est placé dans la première colonne');
  assert.strictEqual(focused, 'editor:1', 'le curseur revient dans le Markdown après l\'ouverture de l\'aperçu');
  // Fichier déjà ouvert dans une autre colonne : on le garde où il est
  vscode.window.visibleTextEditors = [{ document: { uri: doc }, viewColumn: 2 }];
  shown.length = 0;
  await commands['dsfrPreview.openToSide'](doc);
  assert.strictEqual(shown[0].column, 2);
  vscode.window.visibleTextEditors = [];
  // Réglage openMode = window : le bouton ouvre une fenêtre séparée
  settings.openMode = 'window'; calls.length = 0;
  await commands['dsfrPreview.open']();
  assert.deepStrictEqual(others(calls), ['markdown.showPreview', 'workbench.action.moveEditorToNewWindow']);
  delete settings.openMode;

  // Ouverture dans une nouvelle fenêtre
  vscode.window.activeTextEditor = { document: { uri: doc, languageId: 'markdown' } };
  calls.length = 0;
  await commands['dsfrPreview.openInNewWindow']();
  assert.deepStrictEqual(others(calls), ['markdown.showPreview', 'workbench.action.moveEditorToNewWindow']);
  // VS Code ancien : repli sur l'aperçu à côté
  oldVsCode = true; calls.length = 0;
  await commands['dsfrPreview.openInNewWindow'](doc);
  assert(calls.includes('markdown.showPreviewToSide'), calls.join(', '));
  oldVsCode = false;
  // Aperçu désactivé : l'ouverture le réactive
  settings.enabled = false; calls.length = 0;
  await commands['dsfrPreview.openInNewWindow'](doc);
  assert.strictEqual(settings.enabled, true);
  // Réglage défini dans l'espace de travail : la bascule doit écrire au même niveau
  workspaceSettings.enabled = true; settings.enabled = true; updates.length = 0;
  await commands['dsfrPreview.toggle']();
  assert.deepStrictEqual(updates, [2], 'bascule écrite dans les réglages de l\'espace de travail');
  assert.strictEqual(workspaceSettings.enabled, false);

  // En-tête illisible : ligne soulignée, ampoule de correction
  settings.enabled = true; delete workspaceSettings.enabled;
  const badText = '---\ntitle: mentor: Déposer les documents\nsource_url: https://exemple.gouv.fr\n---\n\n# Titre\n';
  const badDoc = textDocument(new Uri(path.join(tmp, 'a.md')), badText);
  fs.writeFileSync(badDoc.uri.fsPath, badText);
  fs.writeFileSync(path.join(tmp, 'b.md'), '---\r\ntitle: mentor: l\'agent\r\n---\r\n\r\nTexte\r\n');
  fs.writeFileSync(path.join(tmp, 'ok.md'), '---\ntitle: Correct\n---\n');
  const diags = await lintVia(badDoc);
  assert.strictEqual(diags.length, 1, 'une ligne soulignée');
  assert.strictEqual(diags[0].range.sl, 1);
  assert(diags[0].message.includes("title: 'mentor: Déposer les documents'"), diags[0].message);
  const actions = codeActionProvider.provideCodeActions(badDoc, diags[0].range, { diagnostics: diags });
  assert.strictEqual(actions.length, 2);
  assert(actions[0].isPreferred && actions[0].edit.entries[0].text === "title: 'mentor: Déposer les documents'", JSON.stringify(actions[0]));
  assert.strictEqual(actions[1].command.command, 'dsfrPreview.fixFrontMatterInWorkspace');
  // Réglage showErrors à false : plus de soulignement
  settings.showErrors = false;
  assert.strictEqual((await lintVia(badDoc)).length, 0);
  settings.showErrors = true;

  // Correction de tout le dossier : rien sans confirmation, puis correction et enregistrement
  modalAnswer = undefined;
  await commands['dsfrPreview.fixFrontMatterInWorkspace']();
  assert.strictEqual(fs.readFileSync(badDoc.uri.fsPath, 'utf8'), badText, 'aucune modification sans confirmation');
  modalAnswer = 'Corriger';
  await commands['dsfrPreview.fixFrontMatterInWorkspace']();
  assert.strictEqual(fs.readFileSync(badDoc.uri.fsPath, 'utf8'), "---\ntitle: 'mentor: Déposer les documents'\nsource_url: https://exemple.gouv.fr\n---\n\n# Titre\n");
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'b.md'), 'utf8'), "---\r\ntitle: 'mentor: l''agent'\r\n---\r\n\r\nTexte\r\n");
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'ok.md'), 'utf8'), '---\ntitle: Correct\n---\n');
  assert.deepStrictEqual(saved.sort(), ['a.md', 'b.md']);
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('Extension (VS Code simulé) : rendu, bascule, aperçu à côté, nouvelle fenêtre, en-têtes soulignés et corrigés OK');
})().catch((e) => { console.error(e); process.exit(1); });
