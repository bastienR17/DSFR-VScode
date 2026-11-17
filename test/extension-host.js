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
const webviewProviders = {};
const otherDiagStores = {};
const commandArgs = [];
const opened = [];
// Faux module https (mise à jour depuis GitHub) : réponses par adresse
let httpsRoutes = null;
const fakeHttps = {
  get(url, opts, cb) {
    const { EventEmitter } = require('events');
    const { Readable } = require('stream');
    const req = new EventEmitter();
    req.destroy = (e) => req.emit('error', e);
    setImmediate(() => {
      const route = httpsRoutes && httpsRoutes[url];
      if (!route) { req.emit('error', new Error('getaddrinfo ENOTFOUND')); return; }
      const res = Readable.from([Buffer.from(route.body || '')]);
      res.statusCode = route.status || 200;
      res.headers = route.headers || {};
      httpsRoutes.seen.push([url, opts.headers['User-Agent']]);
      cb(res);
    });
    return req;
  },
};
let pasteProvider = null;
let clipboardText = '';
const progressTitles = [];
const inputBoxes = [];
let inputAnswer;

// Éditeur modifiable (texte, sélections, modifications, snippets), comme vscode.TextEditor
function editableEditor(uri, initial) {
  let text = initial;
  const off = (p) => { const ls = text.split('\n'); let n = 0; for (let i = 0; i < p.line; i++) n += ls[i].length + 1; return n + p.character; };
  const pos = (o) => { const before = text.slice(0, o).split('\n'); return new vscode.Position(before.length - 1, before[before.length - 1].length); };
  const document = {
    uri, languageId: 'markdown',
    get lineCount() { return text.split('\n').length; },
    getText: (r) => (r ? text.slice(off(r.start), off(r.end)) : text),
    lineAt: (i) => { const t = text.split('\n')[i]; return { text: t, range: new Range(i, 0, i, t.length) }; },
    offsetAt: off, positionAt: pos,
  };
  const editor = {
    document, snippets: [], selections: [],
    get selection() { return editor.selections[0]; },
    set selection(s) { editor.selections = [s]; },
    revealRange() {},
    edit: async (cb) => {
      const ops = [];
      cb({ replace: (r, t) => ops.push([off(r.start), off(r.end), t]), insert: (p, t) => ops.push([off(p), off(p), t]) });
      ops.sort((a, b) => b[0] - a[0]);
      for (const [a, b, t] of ops) text = text.slice(0, a) + t + text.slice(b);
      return true;
    },
    insertSnippet: async (snippet, at) => {
      editor.snippets.push([snippet.value, at]);
      const p = at || editor.selection.start;
      const a = off(p.start ? p.start : p);
      const b = at && at.end ? off(at.end) : a;
      text = text.slice(0, a) + snippet.value.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '') + text.slice(b);
      return true;
    },
    get text() { return text; },
  };
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  return editor;
}
let oldVsCode = false;
class Uri {
  constructor(p) { this.fsPath = p; this.scheme = 'file'; }
  toString() { return 'file://' + this.fsPath; }
  static file(p) { return new Uri(p); }
  static parse(u) { const x = new Uri(u); x.toString = () => u; return x; }
  static joinPath(u, ...parts) { return new Uri(path.join(u.fsPath, ...parts)); }
}
// Éditeurs affichés (colonne → document) et suivi du focus, pour vérifier la disposition côte à côte
const shown = [];
let focused = null;
// Diagnostics, ampoules et modifications de fichiers
const diagStore = new Map();
let codeActionProvider = null;
let pickItems = null;
let pickAnswer = () => undefined;
let pickTitle = null;
const pickTitles = [];
const pickHistory = [];
let lastSelection = null;
const statusItems = [];
let diagnosticsListener = null;
const messages = [];
let completionProvider = null;
let hoverProvider = null;
let foldingProvider = null;
let activeEditorListener = null;
const decorationTypes = [];
let modalAnswer;
const saved = [];
class Range {
  constructor(sl, sc, el, ec) {
    if (typeof sl === 'object') { [el, ec] = [sc.line, sc.character]; [sl, sc] = [sl.line, sl.character]; } // (début, fin)
    Object.assign(this, { sl, sc, el, ec });
    this.start = { line: sl, character: sc };
    this.end = { line: el, character: ec };
  }
}
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
    lineAt: (i) => ({ text: lines[i].replace(/\r$/, ''), range: new Range(i, 0, i, lines[i].replace(/\r$/, '').length) }),
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
    onDidSaveTextDocument: noop,
    getWorkspaceFolder: () => undefined,
    // Applique les remplacements de lignes directement sur le disque
    applyEdit: async (edit) => {
      for (const e of edit.entries) {
        const text = fs.readFileSync(e.uri.fsPath, 'utf8');
        const lines = text.split('\n');
        // Position → indice dans le texte ; une colonne au-delà de la ligne s'arrête avant le « \r » final
        const at = (l, c) => {
          if (l >= lines.length) return text.length;
          let n = 0;
          for (let i = 0; i < l; i++) n += lines[i].length + 1;
          return n + Math.min(c, lines[l].replace(/\r$/, '').length);
        };
        fs.writeFileSync(e.uri.fsPath, text.slice(0, at(e.range.sl, e.range.sc)) + e.text + text.slice(at(e.range.el, e.range.ec)));
      }
      return true;
    },
    openTextDocument: async (u) => (u && u.content !== undefined
      ? Object.assign(textDocument(new Uri('/untitled/Sans titre-1'), u.content), { languageId: u.language, untitled: true })
      : { save: async () => { saved.push(path.basename(u.fsPath)); return true; } }),
    createFileSystemWatcher: () => ({ onDidCreate: noop, onDidChange: noop, onDidDelete: noop, dispose() {} }),
    onDidChangeWorkspaceFolders: noop,
    onDidChangeConfiguration: (fn) => { configListener = fn; return { dispose() {} }; },
  },
  window: {
    activeTextEditor: null,
    createStatusBarItem: () => {
      const item = { visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {}, refresh: () => diagnosticsListener && diagnosticsListener() };
      statusItems.push(item);
      return item;
    },
    showQuickPick: async (items, opts) => { pickItems = items; pickTitle = opts && opts.title; pickTitles.push(pickTitle); pickHistory.push(items); return pickAnswer(items); },
    onDidChangeActiveTextEditor: (fn) => { activeEditorListener = fn; return { dispose() {} }; },
    onDidChangeVisibleTextEditors: noop,
    createTextEditorDecorationType: (opts) => { const t = { opts, dispose() {} }; decorationTypes.push(t); return t; },
    tabGroups: { all: [] },
    registerWebviewViewProvider: (id, provider) => { webviewProviders[id] = provider; return { dispose() {} }; },
    showInformationMessage: async (message) => { messages.push(message); return undefined; },
    showWarningMessage: async (message, options) => { messages.push(message); return options && options.modal ? modalAnswer : undefined; },
    showErrorMessage: async () => undefined,
    withProgress: async (opts, task) => { progressTitles.push(opts.title); return task({ report() {} }, { isCancellationRequested: false }); },
    showInputBox: async (opts) => { inputBoxes.push(opts); return inputAnswer; },
    setStatusBarMessage: (m) => { messages.push(m); return { dispose() {} }; },
    visibleTextEditors: [],
    showTextDocument: async (target, opts) => {
      const document = target.uri ? target : { uri: target, languageId: 'markdown' };
      const editor = { document, viewColumn: opts.viewColumn, revealRange() {}, set selection(sel) { lastSelection = sel; } };
      shown.push({ uri: document.uri.toString(), column: opts.viewColumn, preserveFocus: !!opts.preserveFocus });
      if (!opts.preserveFocus) focused = 'editor:' + opts.viewColumn;
      return editor;
    },
  },
  commands: {
    registerCommand: (id, fn) => { commands[id] = fn; return { dispose() {} }; },
    executeCommand: async (id, ...args) => {
      calls.push(id);
      commandArgs.push([id, ...args]);
      if (id === 'markdown.showPreviewToSide') focused = 'preview'; // comme VS Code : l'aperçu prend le focus
      if (id === 'workbench.action.moveEditorToNewWindow' && oldVsCode) throw new Error('command not found');
    },
  },
  languages: {
    createDiagnosticCollection: (name) => {
      const store = name === 'dsfr' ? diagStore : (otherDiagStores[name] = new Map());
      return {
        set: (uri, list) => store.set(uri.toString(), list),
        delete: (uri) => store.delete(uri.toString()),
        get: (uri) => store.get(uri.toString()),
        has: (uri) => store.has(uri),
        dispose() {},
      };
    },
    registerCodeActionsProvider: (selector, provider) => { codeActionProvider = provider; return { dispose() {} }; },
    registerCompletionItemProvider: (selector, provider, ...triggers) => { completionProvider = { provider, triggers }; return { dispose() {} }; },
    registerHoverProvider: (selector, provider) => { hoverProvider = provider; return { dispose() {} }; },
    registerFoldingRangeProvider: (selector, provider) => { foldingProvider = provider; return { dispose() {} }; },
    onDidChangeDiagnostics: (fn) => { diagnosticsListener = fn; return { dispose() {} }; },
    registerDocumentPasteEditProvider: (selector, provider, metadata) => { pasteProvider = { provider, metadata }; return { dispose() {} }; },
  },
  CompletionItem: class { constructor(label, kind) { Object.assign(this, { label, kind }); } },
  CompletionItemKind: { Module: 8, Property: 9, Value: 11, Snippet: 27 },
  CompletionTriggerKind: { Invoke: 0, TriggerCharacter: 1, TriggerForIncompleteCompletions: 2 },
  SnippetString: class { constructor(value) { this.value = value; } },
  MarkdownString: class { constructor(value) { this.value = value; } },
  Hover: class { constructor(contents, range) { Object.assign(this, { contents, range }); } },
  FoldingRange: class { constructor(start, end) { Object.assign(this, { start, end }); } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  Position: class { constructor(line, character) { Object.assign(this, { line, character }); } },
  Range, Diagnostic, CodeAction, WorkspaceEdit,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
  CodeActionKind: (() => {
    const kind = (value) => ({
      value,
      append: (part) => kind(value + '.' + part),
      intersects: (other) => value === other.value || value.startsWith(other.value + '.') || other.value.startsWith(value + '.'),
    });
    return { QuickFix: kind('quickfix') };
  })(),
  Selection: class {
    constructor(l, c, el, ec) {
      if (typeof l === 'object') { this.anchor = l; this.active = c; } else {
        Object.assign(this, { line: l, character: c });
        this.anchor = { line: l, character: c };
        this.active = el === undefined ? this.anchor : { line: el, character: ec };
      }
      const before = this.anchor.line < this.active.line || (this.anchor.line === this.active.line && this.anchor.character <= this.active.character);
      this.start = before ? this.anchor : this.active;
      this.end = before ? this.active : this.anchor;
    }
  },
  TextEditorRevealType: { InCenter: 2, InCenterIfOutsideViewport: 3 },
  ProgressLocation: { Notification: 15 },
  DocumentPasteTriggerKind: { Automatic: 0, PasteAs: 1 },
  DocumentDropOrPasteEditKind: (() => {
    const kind = (value) => ({ value, append: (...parts) => kind([value, ...parts].filter(Boolean).join('.')) });
    return { Empty: kind(''), Text: kind('text') };
  })(),
  DocumentPasteEdit: class { constructor(insertText, title, kind) { Object.assign(this, { insertText, title, kind }); } },
  env: { clipboard: { readText: async () => clipboardText }, openExternal: async (u) => { opened.push(String(u)); return true; } },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  Uri,
  ViewColumn: { One: 1, Two: 2, Beside: -2 },
  StatusBarAlignment: { Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
};
const orig = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'vscode') return vscode;
  if (req === 'https' && httpsRoutes) return fakeHttps;
  return orig.call(this, req, ...rest);
};

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
  const globalStore = new Map();
  const ctx = {
    subscriptions: [], asAbsolutePath: (p) => path.join(__dirname, '..', p),
    extensionMode: 3, // mode test : pas de vérification automatique (réseau) pendant les tests
    extension: { packageJSON: require('../package.json') },
    globalState: { get: (k) => globalStore.get(k), update: async (k, v) => { globalStore.set(k, v); } },
  };
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

  // Bloc DSFR mal écrit : souligné à la bonne ligne, ampoule avec la valeur la plus proche
  const blockText = '# Page\n\n/// alert | Titre\n    type: warnig\nTexte\n///\n\n/// accordion | Ouvert\nTexte\n';
  const blockDoc = textDocument(new Uri('/tmp/other/blocs.md'), blockText);
  const blockDiags = await lintVia(blockDoc);
  assert.deepStrictEqual(blockDiags.map((d) => [d.range.sl, d.code, d.severity]), [[3, 'dsfr-invalid-block', 0], [7, 'dsfr-unclosed', 1]]);
  assert.deepStrictEqual([blockDiags[0].range.sc, blockDiags[0].range.ec], [10, 16]);
  let blockActions = codeActionProvider.provideCodeActions(blockDoc, blockDiags[0].range, { diagnostics: [blockDiags[0]] });
  assert.deepStrictEqual(blockActions.map((a) => a.title), ['Remplacer « warnig » par « warning »']);
  assert(blockActions[0].isPreferred && blockActions[0].edit.entries[0].text === 'warning');
  blockActions = codeActionProvider.provideCodeActions(blockDoc, blockDiags[1].range, { diagnostics: [blockDiags[1]] });
  assert.deepStrictEqual(blockActions.map((a) => a.title), ['Fermer le bloc par « /// » à la fin de la page'], 'fermeture du bloc proposée');
  // Ampoule demandée sur une autre ligne : rien
  assert.strictEqual(codeActionProvider.provideCodeActions(blockDoc, new Range(0, 0, 0, 0), { diagnostics: [] }).length, 0);
  // Rendu DSFR coupé : plus de soulignement
  settings.enabled = false;
  assert.strictEqual((await lintVia(blockDoc)).length, 0);
  settings.enabled = true;

  // Liens et images introuvables, syntaxe non activée dans le mkdocs.yml du site
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'dsfr-site-'));
  fs.mkdirSync(path.join(site, 'docs'));
  fs.writeFileSync(path.join(site, 'mkdocs.yml'), 'markdown_extensions:\n  - attr_list\n');
  fs.writeFileSync(path.join(site, 'docs', 'autre.md'), '# Autre\n');
  const linkText = '# Page\n\n[Ok](autre.md) [Cassé](absent.md) ![Image](img.png)\n\n/// alert | Titre\nTexte\n///\n';
  const linkDoc = textDocument(new Uri(path.join(site, 'docs', 'page.md')), linkText);
  let siteDiags = await lintVia(linkDoc);
  assert.deepStrictEqual(siteDiags.map((d) => d.code + '@' + d.range.sl), ['dsfr-link-missing@2', 'dsfr-file-missing@2', 'dsfr-mkdocs-extension@4']);
  settings.checkLinks = false;
  assert.strictEqual((await lintVia(linkDoc)).length, 0, 'réglage checkLinks coupé');
  delete settings.checkLinks;
  // Fichier hors du dossier des pages (README à la racine) : liens vérifiés, mais pas le mkdocs.yml
  const readme = textDocument(new Uri(path.join(site, 'README.md')), linkText);
  siteDiags = await lintVia(readme);
  assert.deepStrictEqual(siteDiags.map((d) => d.code), ['dsfr-link-missing', 'dsfr-link-missing', 'dsfr-file-missing']);
  // Conseils (niveau information) : image sans description, lien absolu vers une page du site
  fs.writeFileSync(path.join(site, 'mkdocs.yml'), 'site_url: https://docsirh.e2.rie.gouv.fr/\nmarkdown_extensions:\n  - attr_list\n');
  const tipText = '# Page\n\n![](img.png) voir [Autre](https://docsirh.e2.rie.gouv.fr/autre/) et [PDF](https://docsirh.e2.rie.gouv.fr/fichiers/a.pdf)\n';
  fs.writeFileSync(path.join(site, 'docs', 'img.png'), '');
  const tipDoc = textDocument(new Uri(path.join(site, 'docs', 'conseils.md')), tipText);
  assert.deepStrictEqual((await lintVia(tipDoc)).map((d) => d.code), [], 'images sans description et liens complets : non signalés par défaut');
  settings.checkImageAlt = true;
  settings.checkAbsoluteLinks = true;
  const tipDiags = await lintVia(tipDoc);
  assert.deepStrictEqual(tipDiags.map((d) => [d.code, d.severity]), [['dsfr-img-alt', 2], ['dsfr-absolute-link', 2]]);
  const tipActions = codeActionProvider.provideCodeActions(tipDoc, tipDiags[1].range, { diagnostics: [tipDiags[1]] });
  assert.deepStrictEqual(tipActions.map((a) => a.edit.entries[0].text), ['autre.md']);
  vscode.window.activeTextEditor = { document: tipDoc };
  statusItems[1].refresh();
  assert.strictEqual(statusItems[1].text, '$(pass-filled) Page sans erreur', 'les conseils ne sont pas comptés dans la barre d\'état');
  assert.strictEqual(statusItems[1].color.id, 'testing.iconPassed');
  pickItems = null; pickAnswer = () => undefined; pickTitle = null;
  await commands['dsfrPreview.listProblems']();
  assert.deepStrictEqual(pickItems.map((i) => i.label), ['$(info) Ligne 3', '$(info) Ligne 3']);
  assert.strictEqual(pickTitle, '2 conseils dans cette page');
  vscode.window.activeTextEditor = null;
  // Défaut visible sur le site (titre coupé) : avertissement, compté dans la barre d'état
  const cutDoc = textDocument(new Uri(path.join(site, 'docs', 'coupe.md')), '# Page\n\n## Vérifier que la position permet l\'acquisition de\n\ncongé\n');
  const cutDiags = await lintVia(cutDoc);
  assert.deepStrictEqual(cutDiags.map((d) => [d.code, d.severity]), [['dsfr-split-heading', 1]]);
  vscode.window.activeTextEditor = { document: cutDoc };
  statusItems[1].refresh();
  assert.strictEqual(statusItems[1].text, '$(warning) 1 point à vérifier');
  assert.strictEqual(statusItems[1].backgroundColor.id, 'statusBarItem.warningBackground');
  vscode.window.activeTextEditor = null;
  delete settings.checkImageAlt;
  fs.rmSync(site, { recursive: true, force: true });

  // Commande « Problèmes de la page » : liste avec les lignes, rien n'est modifié ; compteur dans la barre d'état
  assert(!commands['dsfrPreview.fixPage'], 'plus de correction automatique');
  assert(!commands['dsfrPreview.welcome'] && !commands['dsfrPreview.newPage'] && !manifest.walkthroughs, 'pas de pas-à-pas d\'accueil ni de page d\'essai');
  const listText = '/// alert | A\n    type: warnig\nTexte\n///\n\n/// alert | B\n    type: rouge\nTexte\n///\n';
  const listDoc = textDocument(new Uri('/tmp/other/liste.md'), listText);
  vscode.window.activeTextEditor = { document: listDoc };
  pickItems = null; pickAnswer = (list) => list[1];
  await commands['dsfrPreview.listProblems']();
  assert.deepStrictEqual(pickItems.map((i) => i.label), ['$(error) Ligne 2', '$(error) Ligne 7']);
  assert(pickItems[1].detail.startsWith('« rouge » n\'est pas une valeur possible'), pickItems[1].detail);
  assert.deepStrictEqual([lastSelection.line, lastSelection.character], [6, 10], 'curseur placé sur le problème choisi');
  assert.strictEqual(listDoc.getText(), listText);
  statusItems[1].refresh();
  assert.strictEqual(statusItems[1].text, '$(error) 2 points à corriger');
  assert.strictEqual(statusItems[1].backgroundColor.id, 'statusBarItem.errorBackground');
  assert(statusItems[1].visible && statusItems[1].command === 'dsfrPreview.listProblems');
  // Page sans problème : message, compteur masqué
  const okDoc = textDocument(new Uri('/tmp/other/ok.md'), '# Titre\n');
  vscode.window.activeTextEditor = { document: okDoc };
  messages.length = 0;
  await commands['dsfrPreview.listProblems']();
  assert.strictEqual(messages[0], 'Aucun point à corriger dans cette page.');
  statusItems[1].refresh();
  assert(statusItems[1].visible && statusItems[1].text === '$(pass-filled) Page sans erreur' && !statusItems[1].backgroundColor);
  vscode.window.activeTextEditor = null;
  statusItems[1].refresh();
  assert(!statusItems[1].visible, 'pas de page Markdown : rien dans la barre d\'état');

  // « Insérer un composant » : bouton de la barre d'état, liste par familles, insertion au curseur
  assert.strictEqual(statusItems[2].command, 'dsfrPreview.insertComponent');
  assert.strictEqual(statusItems[2].text, '$(add) Insérer un composant');
  const inserted = [];
  const insDoc = textDocument(new Uri('/tmp/other/insert.md'), '# Titre\n\nTexte\n');
  vscode.window.activeTextEditor = { document: insDoc, insertSnippet: async (s, at) => { inserted.push([s.value, at]); return true; } };
  pickAnswer = (list) => list.find((i) => i.item && i.item.prefix === 'dsfr-alerte');
  await commands['dsfrPreview.insertComponent']();
  assert(pickItems[0].kind === -1 && pickItems[0].label.startsWith('Doc SIRH'), 'première famille : Doc SIRH');
  assert(pickItems.some((i) => i.label === '$(warning) Alerte' && i.detail));
  assert(inserted[0][0].startsWith('/// alert | ') && inserted[0][1] === undefined, 'alerte insérée au curseur');
  pickAnswer = (list) => list.find((i) => i.item && i.item.prefix === 'dsfr-sommaire');
  await commands['dsfrPreview.insertComponent']();
  assert.deepStrictEqual([inserted[1][0], inserted[1][1].line], ['---\nsummary: true\n---\n\n$0', 0], 'sommaire : nouvel en-tête en haut de la page');
  vscode.window.activeTextEditor = null;
  messages.length = 0;
  await commands['dsfrPreview.insertComponent']();
  assert(messages[0].startsWith('Ouvrez d\'abord une page Markdown'));

  // Panneau « Composants » : vignettes, puis un clic insère dans la dernière page Markdown utilisée
  assert(manifest.views.dsfr.some((v) => v.id === 'dsfrPreview.components' && v.type === 'webview'));
  assert(fs.existsSync(path.join(__dirname, '..', manifest.viewsContainers.activitybar[0].icon)));
  const panel = webviewProviders['dsfrPreview.components'];
  let onMessage = null;
  const view = { webview: {
    cspSource: 'vscode-resource:', options: null, html: '',
    asWebviewUri: (u) => 'vscode-resource:' + u.fsPath,
    onDidReceiveMessage: (fn) => { onMessage = fn; return { dispose() {} }; },
  } };
  panel.resolveWebviewView(view);
  assert(view.webview.options.enableScripts && view.webview.options.localResourceRoots[0].fsPath.endsWith(path.join('media', 'thumbnails')));
  assert(/<img[^>]+src="vscode-resource:[^"]+thumbnails[\\/]dsfr-alerte\.jpg"/.test(view.webview.html), 'vignette de l\'alerte');
  assert(/Content-Security-Policy[^>]+script-src 'nonce-/.test(view.webview.html));
  const panelDoc = textDocument(new Uri('/tmp/other/panneau.md'), '# Titre\n');
  settings.autoOpen = false;
  activeEditorListener({ document: panelDoc, viewColumn: 1 });
  activeEditorListener(undefined);
  delete settings.autoOpen; // clic dans le panneau : plus d'éditeur actif
  const showDoc = vscode.window.showTextDocument;
  const panelInserted = [];
  vscode.window.showTextDocument = async (document, opts) => ({ document, viewColumn: opts.viewColumn, insertSnippet: async (s, at) => { panelInserted.push([document.uri.fsPath, s.value, at, opts.viewColumn]); return true; } });
  await onMessage({ type: 'insert', prefix: 'dsfr-alerte' });
  assert.strictEqual(panelInserted.length, 1);
  assert(panelInserted[0][0] === '/tmp/other/panneau.md' && panelInserted[0][1].startsWith('/// alert | ') && panelInserted[0][3] === 1, 'alerte insérée dans la page');
  await onMessage({ type: 'insert', prefix: 'dsfr-bandeau' });
  assert.strictEqual(panelInserted[1][2].line, 0, 'bandeau : nouvel en-tête en haut de la page');
  await onMessage({ type: 'insert', prefix: 'inconnu' });
  assert.strictEqual(panelInserted.length, 2);
  panelDoc.isClosed = true;
  messages.length = 0;
  await onMessage({ type: 'insert', prefix: 'dsfr-alerte' });
  assert(messages[0].startsWith('Ouvrez d\'abord une page Markdown') && panelInserted.length === 2, 'page fermée : message');
  vscode.window.showTextDocument = showDoc;
  await commands['dsfrPreview.showComponents']();
  assert(calls.includes('dsfrPreview.components.focus'));

  // Autocomplétion et survol branchés sur l'éditeur
  assert.deepStrictEqual(completionProvider.triggers, ['/', ' ', ':', '-']);
  // « dsfr- » : la liste des snippets s'ouvre à la frappe du « - » et avec Ctrl+Espace (les snippets viennent
  // tous de l'extension : pas de liste fixe de VS Code en double)
  assert.strictEqual(manifest.snippets, undefined, 'pas de snippets fixes déclarés à VS Code');
  const snipDoc = textDocument(new Uri('/tmp/other/snip.md'), 'dsfr-');
  const snipItems = completionProvider.provider.provideCompletionItems(snipDoc, { line: 0, character: 5 }, null, { triggerKind: 1, triggerCharacter: '-' });
  assert(snipItems.length > 20 && snipItems.every((i) => i.kind === vscode.CompletionItemKind.Snippet));
  assert.strictEqual(snipItems.find((i) => i.label === 'dsfr-img').insertText.value, '![$2](https://docsirh.e2.rie.gouv.fr/fichiers/$1)$0');
  assert.strictEqual(completionProvider.provider.provideCompletionItems(snipDoc, { line: 0, character: 5 }, null, { triggerKind: 0 }).length, snipItems.length, 'Ctrl+Espace');
  assert(completionProvider.provider.provideCompletionItems(textDocument(new Uri('/tmp/other/s2.md'), 'dsfr'), { line: 0, character: 4 }, null, { triggerKind: 0 }).length > 20, 'Ctrl+Espace après « dsfr »');
  // dsfr-sirh-version : numéro suivant, d'après le tableau de la page
  const vDoc = textDocument(new Uri('/tmp/other/v.md'), '| **Version** | **Date** | **Emetteur** | **Suivi des modifications** |\n|---|---|---|---|\n| V1 | 01/02/2025 | MATTE / DSNUMRH4 | Création |\n| V2 | 01/03/2026 | MATTE / DSNUMRH4 | Ajout |\ndsfr-sirh-version');
  const vItem = completionProvider.provider.provideCompletionItems(vDoc, { line: 4, character: 17 }, null, { triggerKind: 1, triggerCharacter: '-' }).find((i) => i.label === 'dsfr-sirh-version');
  assert(/^\| V3 \| \d\d\/\d\d\/\d{4} \| \$\{2:MATTE \/ DSNUMRH4\} \| \$\{1:Ce qui a changé\} \|\$0$/.test(vItem.insertText.value), vItem.insertText.value);
  // Tapé au bout de la dernière ligne du tableau : la nouvelle ligne commence à la ligne suivante
  const vEnd = textDocument(new Uri('/tmp/other/v2.md'), '| Version | Date |\n|---|---|\n| V1 | 01/02/2025 |dsfr-sirh-version');
  const vEndItem = completionProvider.provider.provideCompletionItems(vEnd, { line: 2, character: 35 }, null, { triggerKind: 1, triggerCharacter: '-' }).find((i) => i.label === 'dsfr-sirh-version');
  assert(/^\n\| V2 \| /.test(vEndItem.insertText.value), vEndItem.insertText.value);
  const v0 = completionProvider.provider.provideCompletionItems(textDocument(new Uri('/tmp/other/v0.md'), 'dsfr-sirh-version'), { line: 0, character: 17 }, null, { triggerKind: 0 }).find((i) => i.label === 'dsfr-sirh-version');
  assert(v0.insertText.value.startsWith('| V${1:1} |'), 'sans tableau : V1');
  const optDoc = textDocument(new Uri('/tmp/other/opts.md'), '/// tile | Titre\n    picto: build\n');
  const items = completionProvider.provider.provideCompletionItems(optDoc, { line: 1, character: 16 });
  assert(items.length > 10 && items.every((i) => i.range.sc === 11), 'valeurs de picto, remplacement de « build »');
  assert(items.some((i) => i.label === 'buildings/city-hall'));
  const blockItems = completionProvider.provider.provideCompletionItems(textDocument(new Uri('/tmp/x.md'), '/// acc'), { line: 0, character: 7 });
  assert.strictEqual(blockItems.find((i) => i.label === 'accordion').insertText.value, 'accordion | ${1:Titre}');
  const hov = hoverProvider.provideHover(optDoc, { line: 1, character: 6 });
  assert(hov.contents.value.includes('Pictogramme DSFR'), hov.contents.value);
  settings.enabled = false;
  assert.strictEqual(completionProvider.provider.provideCompletionItems(optDoc, { line: 1, character: 16 }), undefined);
  settings.enabled = true;

  // Mise en page « comme le site » : réglages par défaut, puis textes du mkdocs.yml, puis contenu seul
  let framed = md.render('# Titre\n', { currentDocument: new Uri('/tmp/other/page.md') });
  assert(framed.includes('<div class="dsfr-site">') && framed.includes('<p class="fr-header__service-title">Doc SIRH</p>'), framed.slice(0, 400));
  const themed = fs.mkdtempSync(path.join(os.tmpdir(), 'dsfr-theme-'));
  fs.mkdirSync(path.join(themed, 'docs'));
  fs.writeFileSync(path.join(themed, 'mkdocs.yml'), 'theme:\n  name: dsfr\n  header:\n    titre: Mon site\n  afficher_menu_lateral: false\n');
  framed = md.render('# Titre\n', { currentDocument: new Uri(path.join(themed, 'docs', 'page.md')) });
  assert(framed.includes('<p class="fr-header__service-title">Mon site</p>') && !framed.includes('fr-sidemenu') && !framed.includes('Éditer dans'), 'textes du mkdocs.yml');
  fs.rmSync(themed, { recursive: true, force: true });
  settings.desktopWidth = true;
  assert(md.render('# T\n', {}).includes('data-desktop="true"'));
  delete settings.desktopWidth;
  settings.pageLayout = 'content';
  assert(!md.render('# T\n', {}).includes('dsfr-site'), 'réglage pageLayout = content');
  delete settings.pageLayout;

  // Couleurs DSFR des blocs « /// » : appliquées à l'éditeur actif, coupées par le réglage colors
  assert.strictEqual(decorationTypes.length, 5);
  assert.deepStrictEqual(decorationTypes[1].opts.light, { color: '#000091' }, 'nom du bloc en bleu France');
  const decorated = new Map();
  const colDoc = textDocument(new Uri('/tmp/other/couleurs.md'), '/// alert | Titre\n    type: info\nX\n///\n');
  const colEditor = { document: colDoc, setDecorations: (type, ranges) => decorated.set(decorationTypes.indexOf(type), ranges) };
  settings.autoOpen = false;
  activeEditorListener(colEditor);
  assert.deepStrictEqual(decorated.get(1).map((r) => [r.sl, r.sc, r.ec]), [[0, 4, 9]], 'nom « alert » coloré');
  assert.strictEqual(decorated.get(4).length, 2, 'fond sur les lignes d\'ouverture et de fermeture');
  settings.colors = false;
  activeEditorListener(colEditor);
  assert.strictEqual(decorated.get(1).length, 0, 'réglage colors coupé');
  delete settings.colors;
  // Ouverture automatique de l'aperçu : une seule fois, à la première page Markdown
  delete settings.autoOpen;
  calls.length = 0;
  activeEditorListener(colEditor);
  await new Promise((r) => setTimeout(r, 10));
  assert(calls.includes('markdown.showPreviewToSide'), 'aperçu ouvert automatiquement : ' + calls.join(', '));
  calls.length = 0;
  activeEditorListener(colEditor);
  await new Promise((r) => setTimeout(r, 10));
  assert(!calls.includes('markdown.showPreviewToSide'), 'une seule fois par fenêtre');
  vscode.window.activeTextEditor = null;

  // Repli des blocs « /// »
  const foldDoc = textDocument(new Uri('/tmp/other/repli.md'), '/// tabs\n/// tab | Un\nA\n///\n///\n');
  assert.deepStrictEqual(foldingProvider.provideFoldingRanges(foldDoc).map((r) => [r.start, r.end]), [[0, 4], [1, 3]]);
  settings.enabled = false;
  assert.deepStrictEqual(foldingProvider.provideFoldingRanges(foldDoc), []);
  settings.enabled = true;

  // Vérifier tout le dossier (mode développeur) : commande cachée de la palette, raccourci clavier
  assert(manifest.menus.commandPalette.some((m) => m.command === 'dsfrPreview.checkWorkspace' && m.when === 'config.dsfrPreview.devMode'));
  assert(manifest.keybindings.some((k) => k.command === 'dsfrPreview.checkWorkspace' && k.key === 'ctrl+alt+shift+v' && k.mac === 'cmd+alt+shift+v'));
  pickAnswer = (items) => items.find((i) => i.page && i.label.endsWith('b.md'));
  vscode.window.showTextDocument = async (target) => ({ document: { uri: target }, revealRange() {}, set selection(sel) { lastSelection = sel; } });
  const openDoc = vscode.workspace.openTextDocument;
  vscode.workspace.openTextDocument = async (u) => (u && u.fsPath ? textDocument(u, fs.readFileSync(u.fsPath, 'utf8')) : openDoc(u));
  pickTitles.length = 0; pickHistory.length = 0;
  await commands['dsfrPreview.checkWorkspace']();
  assert(/^Vérification des \d+ pages du dossier$/.test(progressTitles[0]), progressTitles[0]);
  assert(/^\d+ points? dans 2 pages sur \d+$/.test(pickTitles[0]), pickTitles[0]);
  assert(pickHistory[0][0].all && pickHistory[0].filter((i) => i.page).length === 2, 'a.md et b.md (en-têtes illisibles)');
  assert(pickHistory[0].find((i) => i.page).detail.startsWith('Ligne 2 : '), 'premier point de la page');
  assert(otherDiagStores['dsfr-dossier'].get(new Uri(path.join(tmp, 'a.md')).toString()).length >= 1, 'points des pages non ouvertes dans le panneau Problèmes');
  assert(!otherDiagStores['dsfr-dossier'].has(new Uri(path.join(tmp, 'b.md')).toString()), 'page ouverte : suivie en direct');
  assert(/points? à corriger dans cette page$/.test(pickTitle), 'liste des points de la page choisie : ' + pickTitle);
  vscode.window.showTextDocument = showDoc;
  vscode.workspace.openTextDocument = openDoc;
  pickAnswer = () => undefined;

  // Barre de mise en forme : boutons en haut des pages Markdown (réglage dsfrPreview.formatBar)
  const titleBar = manifest.menus['editor/title'].filter((m) => /format|newVersion/.test(m.command)).map((m) => m.command.replace('dsfrPreview.', ''));
  assert.deepStrictEqual(titleBar, ['format.bold', 'format.italic', 'format.heading', 'format.bulletList', 'format.numberedList', 'format.link', 'newVersion']);
  for (const id of titleBar) assert(manifest.commands.find((c) => c.command === 'dsfrPreview.' + id).icon, 'icône : ' + id);
  // VS Code n'affiche que 7 boutons d'extension : l'aperçu et 6 boutons de mise en forme, l'italique dans « … »
  const visible = manifest.menus['editor/title'].filter((m) => /^navigation/.test(m.group)).sort((a, b) => Number(a.group.split('@')[1]) - Number(b.group.split('@')[1])).map((m) => m.command.replace('dsfrPreview.', ''));
  assert.deepStrictEqual(visible, ['open', 'format.bold', 'format.heading', 'format.bulletList', 'format.numberedList', 'format.link', 'newVersion']);
  let ed = editableEditor(new Uri('/tmp/other/forme.md'), 'Cliquer sur Rechercher puis valider.\n\nUn\nDeux');
  vscode.window.activeTextEditor = ed;
  ed.selection = new vscode.Selection(0, 12, 0, 22);
  await commands['dsfrPreview.format.bold']();
  assert.strictEqual(ed.text.split('\n')[0], 'Cliquer sur **Rechercher** puis valider.');
  assert.deepStrictEqual([ed.selection.start.character, ed.selection.end.character], [14, 24], 'mot toujours sélectionné');
  await commands['dsfrPreview.format.bold']();
  assert.strictEqual(ed.text.split('\n')[0], 'Cliquer sur Rechercher puis valider.', 'second clic : gras retiré');
  ed.selections = [new vscode.Selection(0, 0, 0, 7), new vscode.Selection(0, 28, 0, 35)]; // plusieurs curseurs
  await commands['dsfrPreview.format.italic']();
  assert.strictEqual(ed.text.split('\n')[0], '*Cliquer* sur Rechercher puis *valider*.');
  assert.deepStrictEqual(ed.selections.map((x) => [x.start.character, x.end.character]), [[1, 8], [31, 38]]);
  ed.selection = new vscode.Selection(2, 0, 3, 4);
  await commands['dsfrPreview.format.numberedList']();
  assert.deepStrictEqual(ed.text.split('\n').slice(2), ['1. Un', '2. Deux']);
  ed.selection = new vscode.Selection(0, 3, 0, 3);
  pickAnswer = (items) => items.find((i) => i.level === 2);
  await commands['dsfrPreview.format.heading']();
  assert.strictEqual(ed.text.split('\n')[0], '## *Cliquer* sur Rechercher puis *valider*.');
  pickAnswer = () => undefined;
  ed = editableEditor(new Uri('/tmp/other/lien.md'), 'Voir le site.');
  vscode.window.activeTextEditor = ed;
  ed.selection = new vscode.Selection(0, 5, 0, 12);
  clipboardText = 'https://www.service-public.fr/';
  inputAnswer = 'https://www.service-public.fr/';
  await commands['dsfrPreview.format.link']();
  assert.strictEqual(inputBoxes[0].value, 'https://www.service-public.fr/', 'adresse copiée proposée');
  assert.strictEqual(ed.text, 'Voir [le site](https://www.service-public.fr/).');

  // Nouvelle version : ligne ajoutée au suivi des modifications, curseur sur « ce qui a changé »
  ed = editableEditor(new Uri('/tmp/other/suivi.md'), '# T\n\n| **Version** | **Date** | **Emetteur** | **Suivi des modifications** |\n|----|----|----|----|\n| V1 | 01/02/2025 | MATTE / DSNUMRH4 | Création |\n\nSuite');
  vscode.window.activeTextEditor = ed;
  await commands['dsfrPreview.newVersion']();
  const d = new Date();
  const today = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  assert.strictEqual(ed.text.split('\n')[5], '| V2 | ' + today + ' | MATTE / DSNUMRH4 | Ce qui a changé |');
  assert(ed.snippets[0][0].includes('${1:Ce qui a changé}') && ed.snippets[0][1].line === 5);
  // Fin de fichier sans retour à la ligne
  ed = editableEditor(new Uri('/tmp/other/suivi2.md'), '| Version | Date |\n|--|--|\n| V4 | 01/01/2026 |');
  vscode.window.activeTextEditor = ed;
  await commands['dsfrPreview.newVersion']();
  assert.strictEqual(ed.text, '| Version | Date |\n|--|--|\n| V4 | 01/01/2026 |\n| V5 | ' + today + ' |');
  // Pas de tableau : proposé sous le titre de la page
  ed = editableEditor(new Uri('/tmp/other/suivi3.md'), '# Titre\n\nTexte');
  vscode.window.activeTextEditor = ed;
  const info = vscode.window.showInformationMessage;
  vscode.window.showInformationMessage = async (m, ...actions) => { messages.push(m); return actions[0]; };
  await commands['dsfrPreview.newVersion']();
  vscode.window.showInformationMessage = info;
  assert(ed.text.startsWith('# Titre\n\n/// accordion | **Suivi des modifications**\n\n| **Version** |'), ed.text);
  assert(ed.text.endsWith('///\n\nTexte'), JSON.stringify(ed.text));

  // Collage depuis Word : Markdown proposé (et choisi par défaut dans les pages Markdown)
  assert.deepStrictEqual(manifest.configurationDefaults['[markdown]']['editor.pasteAs.preferences'], ['markdown.dsfr']);
  assert.strictEqual(pasteProvider.metadata.providedPasteEditKinds[0].value, 'markdown.dsfr');
  const transfer = (items) => ({ get: (mime) => (mime in items ? { asString: async () => items[mime] } : undefined) });
  const pasteDoc = textDocument(new Uri('/tmp/other/coller.md'), 'Intro :\n\nSuite');
  pasteDoc.lineAt = (i) => ({ text: ['Intro :', '', 'Suite'][i] });
  const at = [new Range(1, 0, 1, 0)];
  let edits = await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/html': fs.readFileSync(path.join(__dirname, 'fixtures', 'word-modop.html'), 'utf8') }), { triggerKind: 0 }, {});
  assert.strictEqual(edits.length, 1);
  assert.strictEqual(edits[0].title, 'Markdown DSFR (depuis Word)');
  assert(edits[0].insertText instanceof vscode.SnippetString, 'images : snippet');
  assert(edits[0].insertText.value.startsWith('\n## Rechercher l’acte\n') && edits[0].insertText.value.endsWith('\\\\# pas un titre$0\n'), 'lignes vides autour');
  assert(edits[0].insertText.value.includes('](https://docsirh.e2.rie.gouv.fr/fichiers/${1})'), 'curseur sur le nom de la première image');
  edits = await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/plain': 'A\tB\n1\t2' }), { triggerKind: 0 }, {});
  assert.strictEqual(edits[0].title, 'Tableau Markdown (depuis Excel)');
  assert.strictEqual(typeof edits[0].insertText, 'string');
  assert.strictEqual(await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/plain': 'mot' }), { triggerKind: 0 }, {}), undefined, 'texte simple : collage normal');
  assert.strictEqual(await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/html': '<b>x</b>', 'vscode-editor-data': '{}' }), { triggerKind: 0 }, {}), undefined, 'copie faite dans VS Code');
  assert.strictEqual(await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/html': '<span>x</span>' }), { triggerKind: 0 }, {}), undefined, 'HTML sans mise en forme');
  settings.pasteFromWord = false;
  assert.strictEqual(await pasteProvider.provider.provideDocumentPasteEdits(pasteDoc, at, transfer({ 'text/html': '<b>x</b>' }), { triggerKind: 0 }, {}), undefined, 'réglage coupé');
  delete settings.pasteFromWord;
  // Commande de repli (texte seul)
  ed = editableEditor(new Uri('/tmp/other/coller2.md'), '');
  vscode.window.activeTextEditor = ed;
  clipboardText = 'Premier.\r\n•\tUn\r\n•\tDeux';
  await commands['dsfrPreview.pastePlainFromWord']();
  assert.strictEqual(ed.text, 'Premier.\n\n- Un\n- Deux');
  vscode.window.activeTextEditor = null;

  // Images en ligne cassées : le serveur est interrogé (en-tête seulement), puis la page est revérifiée
  {
    const http = require('http');
    const was = { enabled: settings.enabled, showErrors: settings.showErrors };
    settings.enabled = true; settings.showErrors = true;
    const seenMethods = [];
    const server = http.createServer((req, res) => {
      seenMethods.push(req.method + ' ' + req.url + (req.headers.range ? ' ' + req.headers.range : ''));
      if (req.url === '/fichiers/sans-head.png') { res.writeHead(req.method === 'HEAD' ? 405 : 404); res.end(); return; }
      if (req.url === '/fichiers/ok.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(); return; }
      if (req.url === '/fichiers/page.png') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(); return; }
      if (req.url === '/fichiers/ancien.png') { res.writeHead(301, { Location: '/fichiers/ok.png' }); res.end(); return; }
      res.writeHead(404); res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/fichiers/';
    const imgDoc = textDocument(new Uri(path.join(tmp, 'images-en-ligne.md')),
      '# Images\n\n![Bonne](' + base + 'ok.png)\n\n![Absente](' + base + 'absente.png)\n\n<img\n  src="' + base + 'page.png"\n  alt="x">\n\n![Déplacée](' + base + 'ancien.png)\n\n![Serveur sans HEAD](' + base + 'sans-head.png)\n');
    const first = (await lintVia(imgDoc)).filter((d) => d.code === 'dsfr-image-broken');
    assert.strictEqual(first.length, 0, 'réponse du serveur pas encore connue');
    for (let i = 0; i < 50 && seenMethods.length < 7; i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 50));
    const broken = (await lintVia(imgDoc)).filter((d) => d.code === 'dsfr-image-broken');
    assert.deepStrictEqual(broken.map((d) => [d.range.sl, d.severity]), [[4, 1], [7, 1], [12, 1]], 'image absente (404), page web au lieu d\'une image, serveur sans HEAD');
    assert(seenMethods.filter((m) => !m.startsWith('HEAD')).every((m) => m === 'GET /fichiers/sans-head.png bytes=0-0'), 'en-tête seulement, sinon un octet : ' + seenMethods);
    // Réglage coupé : rien
    settings.checkRemoteImages = false;
    assert.strictEqual((await lintVia(imgDoc)).filter((d) => d.code === 'dsfr-image-broken').length, 0);
    delete settings.checkRemoteImages;
    Object.assign(settings, was);
    server.close();
  }

  // Mise à jour depuis GitHub (commande « Rechercher une mise à jour ») : Release plus récente, téléchargement
  // (avec redirection vers les serveurs de fichiers de GitHub), installation, rechargement
  const current = require('../package.json').version;
  const latest = 'https://api.github.com/repos/bastienR17/DSFR-VScode/releases/latest';
  const asset = 'https://github.com/bastienR17/DSFR-VScode/releases/download/v99.0/dsfr-markdown-preview-99.0.0.vsix';
  const release = (v) => JSON.stringify({ tag_name: 'v' + v, html_url: 'https://github.com/bastienR17/DSFR-VScode/releases/tag/v' + v, draft: false, prerelease: false,
    assets: [{ name: 'dsfr-markdown-preview-' + v + '.vsix', browser_download_url: asset }] });
  httpsRoutes = { seen: [],
    [latest]: { body: release('99.0.0') },
    [asset]: { status: 302, headers: { location: 'https://objects.githubusercontent.com/github-production-release-asset/abc' } },
    'https://objects.githubusercontent.com/github-production-release-asset/abc': { body: 'PK-faux-vsix' },
  };
  const infoMsg = vscode.window.showInformationMessage;
  const prompts = [];
  vscode.window.showInformationMessage = async (m, ...actions) => { prompts.push([m, actions]); return actions.find((a) => a === 'Mettre à jour' || a === 'Recharger VS Code'); };
  commandArgs.length = 0;
  await commands['dsfrPreview.checkUpdates']();
  assert.strictEqual(prompts[0][0], 'Une nouvelle version de l\'Aperçu DSFR est disponible : 99.0.0 (vous avez la ' + current + ').');
  assert.deepStrictEqual(prompts[0][1], ['Mettre à jour', 'Voir les nouveautés', 'Ignorer cette version']);
  assert(httpsRoutes.seen.every(([, ua]) => ua === 'dsfr-markdown-preview'), 'en-tête User-Agent (exigé par GitHub)');
  const install = commandArgs.find((c) => c[0] === 'workbench.extensions.installExtension');
  assert(install && install[1].fsPath.endsWith('dsfr-markdown-preview-99.0.0.vsix'), 'vsix téléchargé puis installé');
  assert.strictEqual(fs.readFileSync(install[1].fsPath, 'utf8'), 'PK-faux-vsix');
  assert(/99\.0\.0 est installé/.test(prompts[1][0]) && calls.includes('workbench.action.reloadWindow'), 'rechargement proposé');
  assert(Number.isFinite(globalStore.get('dsfr.update.lastCheck')));
  // Déjà à jour
  prompts.length = 0;
  httpsRoutes[latest] = { body: release(current) };
  await commands['dsfrPreview.checkUpdates']();
  assert.deepStrictEqual(prompts.map((p) => p[0]), ['Aperçu DSFR est à jour (version ' + current + ').']);
  // « Voir les nouveautés » : page de la Release ; « Ignorer cette version » : retenu
  httpsRoutes[latest] = { body: release('99.0.0') };
  vscode.window.showInformationMessage = async (m, ...actions) => actions[1];
  await commands['dsfrPreview.checkUpdates']();
  assert.deepStrictEqual(opened, ['https://github.com/bastienR17/DSFR-VScode/releases/tag/v99.0.0']);
  vscode.window.showInformationMessage = async (m, ...actions) => actions[2];
  await commands['dsfrPreview.checkUpdates']();
  assert.strictEqual(globalStore.get('dsfr.update.skip'), '99.0.0');
  // GitHub injoignable (proxy du ministère…) : message, rien d'installé
  vscode.window.showInformationMessage = infoMsg;
  httpsRoutes = { seen: [] };
  messages.length = 0;
  commandArgs.length = 0;
  await commands['dsfrPreview.checkUpdates']();
  assert(messages[0].startsWith('Impossible de joindre GitHub') && !commandArgs.some((c) => c[0] === 'workbench.extensions.installExtension'));
  httpsRoutes = null;

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

  console.log('Extension (VS Code simulé) : rendu, bascule, aperçu à côté, nouvelle fenêtre, blocs, en-têtes et liens soulignés, corrections à la demande, liste des problèmes, panneau des composants, images en ligne cassées, mise à jour depuis GitHub, vérification du dossier, mise en forme, nouvelle version, collage depuis Word, autocomplétion et survol OK');
})().catch((e) => { console.error(e); process.exit(1); });
