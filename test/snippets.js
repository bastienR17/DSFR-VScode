// Vérifie que chaque snippet, rempli avec ses valeurs par défaut, produit un rendu DSFR valide
const createMd = require('./vscode-like.js');
const assert = require('assert');
const snippets = require('../snippets/dsfr.json');
let n = 0;
for (const [name, s] of Object.entries(snippets)) {
  const src = s.body.join('\n')
    .replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\d+/g, '');
  // Les snippets d'en-tête sont testés dans un en-tête complet, avec des titres pour le sommaire
  const full = /en-tête ---/.test(s.description) ? '---\n' + src + '\n---\n\n# Titre\n\n## Partie\n' : src;
  const html = createMd({ showErrors: () => true }).render(full, {});
  assert(!html.includes('dsfr-preview-error'), 'Snippet « ' + name + ' » invalide :\n' + src + '\n' + html);
  assert(/class="fr-/.test(html), 'Snippet « ' + name + ' » sans classe DSFR :\n' + html);
  n++;
}
console.log('Snippets : ' + n + ' rendus DSFR valides');
