// Coloration des blocs « /// » dans l'éditeur (syntaxes/dsfr-blocks.tmLanguage.json), injectée dans la
// grammaire Markdown de VS Code (copie dans test/fixtures, licence MIT, dépôt microsoft/vscode).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vt = require('vscode-textmate');
const onig = require('vscode-oniguruma');

const GRAMMARS = {
  'text.html.markdown': path.join(__dirname, 'fixtures', 'markdown.tmLanguage.json'),
  'markdown.dsfr.blocks': path.join(__dirname, '..', 'syntaxes', 'dsfr-blocks.tmLanguage.json'),
};
const onigLib = onig.loadWASM(fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer)
  .then(() => ({ createOnigScanner: (p) => new onig.OnigScanner(p), createOnigString: (s) => new onig.OnigString(s) }));
const registry = new vt.Registry({
  onigLib,
  loadGrammar: async (s) => (GRAMMARS[s] ? vt.parseRawGrammar(fs.readFileSync(GRAMMARS[s], 'utf8'), GRAMMARS[s]) : null),
  getInjections: (s) => (s === 'text.html.markdown' ? ['markdown.dsfr.blocks'] : undefined),
});

// Portée DSFR la plus précise de chaque morceau de texte : [[texte, portée], …] par ligne
function tokenize(grammar, text) {
  let stack = vt.INITIAL;
  return text.split('\n').map((line) => {
    const r = grammar.tokenizeLine(line, stack);
    stack = r.ruleStack;
    return r.tokens.map((t) => [line.slice(t.startIndex, t.endIndex), t.scopes.filter((s) => s.endsWith('.dsfr')).pop() || t.scopes[t.scopes.length - 1]]);
  });
}
const scopeOf = (lines, l, word) => (lines[l].find(([t]) => t === word) || [])[1];

(async () => {
  // Le manifeste déclare bien la grammaire
  const pkg = require('../package.json');
  assert(pkg.contributes.grammars.some((g) => g.scopeName === 'markdown.dsfr.blocks' && g.injectTo.includes('text.html.markdown')));

  const g = await registry.loadGrammar('text.html.markdown');
  const src = [
    '# Titre',                       // 0
    '',
    'Texte',                         // 2
    '/// alert | Attention',         // 3
    '    type: warning',             // 4
    '    open: True',                // 5
    '    description: "Avec : deux points"', // 6
    '    attrs: {class: x}',         // 7
    'Contenu',                       // 8
    '///',                           // 9
    '',
    '```',                           // 11
    '/// alert',                     // 12
    '```',                           // 13
    '',
    '    /// alert',                 // 15 : code indenté
  ].join('\n');
  const lines = tokenize(g, src);
  assert.strictEqual(scopeOf(lines, 3, '///'), 'punctuation.definition.tag.begin.dsfr');
  assert.strictEqual(scopeOf(lines, 3, 'alert'), 'entity.name.tag.dsfr');
  assert.strictEqual(scopeOf(lines, 3, '|'), 'punctuation.separator.dsfr');
  assert.strictEqual(scopeOf(lines, 3, 'Attention'), 'string.unquoted.title.dsfr');
  assert.strictEqual(scopeOf(lines, 4, 'type'), 'support.type.property-name.dsfr');
  assert.strictEqual(scopeOf(lines, 4, 'warning'), 'string.unquoted.value.dsfr');
  assert.strictEqual(scopeOf(lines, 5, 'True'), 'constant.language.boolean.dsfr');
  assert.strictEqual(scopeOf(lines, 6, '"Avec : deux points"'), 'string.quoted.dsfr');
  assert.strictEqual(scopeOf(lines, 7, '{class: x}'), 'meta.structure.dictionary.dsfr');
  assert(!lines[8].some(([, s]) => s.endsWith('.dsfr')), 'le contenu reste du Markdown');
  assert.strictEqual(scopeOf(lines, 9, '///'), 'punctuation.definition.tag.end.dsfr');
  assert(!lines[12].some(([, s]) => s.endsWith('.dsfr')), 'bloc de code : pas de coloration DSFR');
  assert(!lines[15].some(([, s]) => s.endsWith('.dsfr')), 'code indenté : pas de coloration DSFR');
  assert.strictEqual(scopeOf(lines, 0, 'Titre'), 'entity.name.section.markdown', 'le reste du Markdown est inchangé');

  // Les pages d'exemple : chaque en-tête « /// nom » est coloré
  const demo = fs.readFileSync(path.join(__dirname, '..', 'samples', 'demo.md'), 'utf8');
  const demoLines = tokenize(g, demo);
  demo.split('\n').forEach((l, i) => {
    if (/^\/{3}\s*[a-z]/.test(l)) assert.strictEqual(demoLines[i].find(([t]) => /^[a-z]/.test(t))[1], 'entity.name.tag.dsfr', l);
  });
  console.log('Coloration des blocs /// dans l\'éditeur : en-têtes, options, fermetures ; code ignoré OK');
})().catch((e) => { console.error(e); process.exit(1); });
