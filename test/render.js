// Rend une liste de cas Markdown (JSON sur stdin) comme l'aperçu VS Code, sans le marqueur d'état
const createMd = require('./vscode-like.js');
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const errors = process.argv.includes('--errors');
const out = input.map((src) => createMd({ showErrors: () => errors }).render(src, {})
  .replace(/^<div id="dsfr-preview-state"[^>]*><\/div>\n/, ''));
process.stdout.write(JSON.stringify(out));
