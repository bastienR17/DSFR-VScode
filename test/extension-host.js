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
class Uri { constructor(p) { this.fsPath = p; this.scheme = 'file'; } toString() { return 'file://' + this.fsPath; } }
// Éditeurs affichés (colonne → document) et suivi du focus, pour vérifier la disposition côte à côte
const shown = [];
let focused = null;
// Diagnostics, ampoules et modifications de fichiers
const diagStore = new Map();
let codeActionProvider = null;
let pickItems = null;
let pickAnswer = () => undefined;
let pickTitle = null;
let lastSelection = null;
const statusItems = [];
let diagnosticsListener = null;
const messages = [];
let completionProvider = null;
let hoverProvider = null;
let modalAnswer;
const saved = [];
class Range {
  constructor(sl, sc, el, ec) {
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
    openTextDocument: async (u) => ({ save: async () => { saved.push(path.basename(u.fsPath)); return true; } }),
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
    showQuickPick: async (items, opts) => { pickItems = items; pickTitle = opts && opts.title; return pickAnswer(items); },
    onDidChangeActiveTextEditor: noop,
    showInformationMessage: async (message) => { messages.push(message); return undefined; },
    showWarningMessage: async (message, options) => { messages.push(message); return options && options.modal ? modalAnswer : undefined; },
    showErrorMessage: async () => undefined,
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
      get: (uri) => diagStore.get(uri.toString()),
      dispose() {},
    }),
    registerCodeActionsProvider: (selector, provider) => { codeActionProvider = provider; return { dispose() {} }; },
    registerCompletionItemProvider: (selector, provider, ...triggers) => { completionProvider = { provider, triggers }; return { dispose() {} }; },
    registerHoverProvider: (selector, provider) => { hoverProvider = provider; return { dispose() {} }; },
    onDidChangeDiagnostics: (fn) => { diagnosticsListener = fn; return { dispose() {} }; },
  },
  CompletionItem: class { constructor(label, kind) { Object.assign(this, { label, kind }); } },
  CompletionItemKind: { Module: 8, Property: 9, Value: 11, Snippet: 27 },
  CompletionTriggerKind: { Invoke: 0, TriggerCharacter: 1, TriggerForIncompleteCompletions: 2 },
  SnippetString: class { constructor(value) { this.value = value; } },
  MarkdownString: class { constructor(value) { this.value = value; } },
  Hover: class { constructor(contents, range) { Object.assign(this, { contents, range }); } },
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
  Selection: class { constructor(l, c) { Object.assign(this, { line: l, character: c }); } },
  TextEditorRevealType: { InCenter: 2 },
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
  const tipDiags = await lintVia(tipDoc);
  assert.deepStrictEqual(tipDiags.map((d) => [d.code, d.severity]), [['dsfr-img-alt', 2], ['dsfr-absolute-link', 2]]);
  const tipActions = codeActionProvider.provideCodeActions(tipDoc, tipDiags[1].range, { diagnostics: [tipDiags[1]] });
  assert.deepStrictEqual(tipActions.map((a) => a.edit.entries[0].text), ['autre.md']);
  vscode.window.activeTextEditor = { document: tipDoc };
  statusItems[1].refresh();
  assert(!statusItems[1].visible, 'les conseils ne sont pas comptés dans la barre d\'état');
  pickItems = null; pickAnswer = () => undefined; pickTitle = null;
  await commands['dsfrPreview.listProblems']();
  assert.deepStrictEqual(pickItems.map((i) => i.label), ['$(info) Ligne 3', '$(info) Ligne 3']);
  assert.strictEqual(pickTitle, 'DSFR : 2 conseils dans cette page');
  vscode.window.activeTextEditor = null;
  // Défaut visible sur le site (titre coupé) : avertissement, compté dans la barre d'état
  const cutDoc = textDocument(new Uri(path.join(site, 'docs', 'coupe.md')), '# Page\n\n## Vérifier que la position permet l\'acquisition de\n\ncongé\n');
  const cutDiags = await lintVia(cutDoc);
  assert.deepStrictEqual(cutDiags.map((d) => [d.code, d.severity]), [['dsfr-split-heading', 1]]);
  vscode.window.activeTextEditor = { document: cutDoc };
  statusItems[1].refresh();
  assert.strictEqual(statusItems[1].text, '$(warning) 1 DSFR');
  vscode.window.activeTextEditor = null;
  settings.checkImageAlt = false;
  assert.deepStrictEqual((await lintVia(tipDoc)).map((d) => d.code), ['dsfr-absolute-link'], 'réglage checkImageAlt coupé');
  delete settings.checkImageAlt;
  fs.rmSync(site, { recursive: true, force: true });

  // Commande « Problèmes de la page » : liste avec les lignes, rien n'est modifié ; compteur dans la barre d'état
  assert(!commands['dsfrPreview.fixPage'], 'plus de correction automatique');
  const listText = '/// alert | A\n    type: warnig\nTexte\n///\n\n/// alert | B\n    type: rouge\nTexte\n///\n';
  const listDoc = textDocument(new Uri('/tmp/other/liste.md'), listText);
  vscode.window.activeTextEditor = { document: listDoc };
  pickItems = null; pickAnswer = (list) => list[1];
  await commands['dsfrPreview.listProblems']();
  assert.deepStrictEqual(pickItems.map((i) => i.label), ['$(error) Ligne 2', '$(error) Ligne 7']);
  assert(pickItems[1].detail.startsWith('Valeur « rouge » invalide'), pickItems[1].detail);
  assert.deepStrictEqual([lastSelection.line, lastSelection.character], [6, 10], 'curseur placé sur le problème choisi');
  assert.strictEqual(listDoc.getText(), listText);
  statusItems[1].refresh();
  assert.strictEqual(statusItems[1].text, '$(error) 2 DSFR');
  assert(statusItems[1].visible && statusItems[1].command === 'dsfrPreview.listProblems');
  // Page sans problème : message, compteur masqué
  const okDoc = textDocument(new Uri('/tmp/other/ok.md'), '# Titre\n');
  vscode.window.activeTextEditor = { document: okDoc };
  messages.length = 0;
  await commands['dsfrPreview.listProblems']();
  assert.strictEqual(messages[0], 'DSFR : aucun problème dans cette page.');
  statusItems[1].refresh();
  assert(!statusItems[1].visible);
  vscode.window.activeTextEditor = null;

  // Autocomplétion et survol branchés sur l'éditeur
  assert.deepStrictEqual(completionProvider.triggers, ['/', ' ', ':', '-']);
  // « dsfr- » : la liste des snippets s'ouvre à la frappe du « - », pas en double sur Ctrl+Espace
  const snipDoc = textDocument(new Uri('/tmp/other/snip.md'), 'dsfr-');
  const snipItems = completionProvider.provider.provideCompletionItems(snipDoc, { line: 0, character: 5 }, null, { triggerKind: 1, triggerCharacter: '-' });
  assert(snipItems.length > 20 && snipItems.every((i) => i.kind === vscode.CompletionItemKind.Snippet));
  assert.strictEqual(snipItems.find((i) => i.label === 'dsfr-img').insertText.value, '![$2](https://docsirh.e2.rie.gouv.fr/fichiers/$1)$0');
  assert.strictEqual(completionProvider.provider.provideCompletionItems(snipDoc, { line: 0, character: 5 }, null, { triggerKind: 0 }), undefined);
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

  console.log('Extension (VS Code simulé) : rendu, bascule, aperçu à côté, nouvelle fenêtre, blocs, en-têtes et liens soulignés, corrections à la demande, liste des problèmes, autocomplétion et survol OK');
})().catch((e) => { console.error(e); process.exit(1); });
