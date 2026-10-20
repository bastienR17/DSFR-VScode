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
  // Un composant DSFR produit des classes fr-* ; une simple image Markdown (dsfr-img), non.
  if (src.startsWith('![')) assert(/<img src="https:\/\/docsirh\.e2\.rie\.gouv\.fr\/fichiers\/[^"]+" alt="[^"]+">/.test(html), 'Snippet « ' + name + ' » : image attendue :\n' + html);
  else assert(/class="fr-/.test(html), 'Snippet « ' + name + ' » sans classe DSFR :\n' + html);
  n++;
}
console.log('Snippets : ' + n + ' rendus valides');
