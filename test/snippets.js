// Vérifie que chaque snippet, rempli avec ses valeurs par défaut, produit un rendu DSFR valide
const createMd = require('./vscode-like.js');
const assert = require('assert');
const snippets = require('../snippets/dsfr.json');
let n = 0;
// Remplit un snippet avec ses valeurs par défaut (choix : la première ; variables de date : laissées telles quelles)
function fill(body) {
  return body
    .replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, 'X')
    .replace(/\$\d+/g, '');
}
for (const [name, s] of Object.entries(snippets)) {
  const src = fill(s.body.join('\n'));
  // Les snippets d'en-tête sont testés dans un en-tête complet, avec des titres pour le sommaire
  const full = /en-tête ---/.test(s.description) ? '---\n' + src + '\n---\n\n# Titre\n\n## Partie\n' : src;
  const html = createMd({ showErrors: () => true }).render(full, {});
  assert(!html.includes('dsfr-preview-error'), 'Snippet « ' + name + ' » invalide :\n' + src + '\n' + html);
  // Un composant DSFR produit des classes fr-* ; une simple image Markdown (dsfr-img), non.
  // Snippets Doc SIRH sans composant DSFR (chemin, profil, ligne de tableau) : seulement « aucune erreur ».
  const plain = /^```|^\| V|^<img/.test(src);
  // Niveau de fil d'Ariane : vérifié une fois inséré dans le fil d'Ariane Doc SIRH, avant la page courante.
  if (/^\s*<li>/.test(src)) {
    const navSrc = fill(snippets["Doc SIRH : fil d'Ariane"].body.join('\n'));
    const withLevel = navSrc.replace(/(\n\s*<li>\n\s*<a class="fr-breadcrumb__link" aria-current)/, '\n' + src + '$1');
    const navHtml = createMd({ showErrors: () => true }).render(withLevel, {});
    assert((navHtml.match(/class="fr-breadcrumb__link"/g) || []).length === 5 && !navHtml.includes('<pre>'), 'Niveau de fil d\'Ariane mal inséré :\n' + navHtml);
    n++;
    continue;
  }
  if (plain) { n++; continue; }
  if (src.startsWith('![')) {
    // dsfr-img : seulement le début de l'adresse, le reste est complété par le rédacteur
    assert.strictEqual(src, '![](https://docsirh.e2.rie.gouv.fr/fichiers/)');
    assert(/<img src="https:\/\/docsirh\.e2\.rie\.gouv\.fr\/fichiers\/" alt="">/.test(html), 'Snippet « ' + name + ' » : image attendue :\n' + html);
  }
  else assert(/class="fr-/.test(html), 'Snippet « ' + name + ' » sans classe DSFR :\n' + html);
  n++;
}
// Tuiles et cartes côte à côte : autant de colonnes et de composants que demandé
for (const [prefix, cls, count] of [['dsfr-tuile-2', 'fr-tile', 2], ['dsfr-tuile-3', 'fr-tile', 3], ['dsfr-carte-2', 'fr-card', 2], ['dsfr-carte-3', 'fr-card', 3]]) {
  const s = Object.values(snippets).find((x) => [].concat(x.prefix)[0] === prefix);
  assert(s, 'snippet manquant : ' + prefix);
  const html = createMd({ showErrors: () => true }).render(fill(s.body.join('\n')), {});
  assert.strictEqual((html.match(/class="fr-col-12 fr-col-md-/g) || []).length, count, prefix + ' : colonnes\n' + html);
  assert.strictEqual((html.match(new RegExp('class="' + cls + '[ "]', 'g')) || []).length, count, prefix + ' : composants\n' + html);
}
console.log('Snippets : ' + n + ' rendus valides');
