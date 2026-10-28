// Problèmes signalés dans l'éditeur (lib/lint.js) : position exacte et corrections rapides.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createLinter, closest } = require('../lib/lint');

const lint = createLinter();

// Applique les modifications d'une correction au texte (positions ligne/colonne, comme VS Code).
function apply(text, edits) {
  const lines = text.split('\n');
  const offset = (p) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  const sorted = edits.slice().sort((a, b) => offset(b.start) - offset(a.start));
  for (const e of sorted) text = text.slice(0, offset(e.start)) + e.text + text.slice(offset(e.end));
  return text;
}
const only = (text) => {
  const issues = lint(text);
  assert.strictEqual(issues.length, 1, JSON.stringify(issues, null, 1));
  return issues[0];
};
const word = (text, issue) => text.split('\n')[issue.range.line].slice(issue.range.start, issue.range.end);
const fixed = (text, issue, i) => apply(text, issue.fixes[i || 0].edits);
const clean = (text) => assert.deepStrictEqual(lint(text), [], text);

// Valeur mal orthographiée : soulignée seule, remplacée par la plus proche
let src = '# Page\n\n/// alert | Titre\n    type: warnig\nTexte\n///\n';
let issue = only(src);
assert.strictEqual(issue.severity, 'error');
assert.strictEqual(issue.range.line, 3);
assert.strictEqual(word(src, issue), 'warnig');
assert.strictEqual(issue.fixes[0].title, 'Remplacer « warnig » par « warning »');
assert(issue.fixes[0].preferred);
clean(fixed(src, issue));

// Valeur sans équivalent proche : toutes les valeurs possibles sont proposées
issue = only('/// alert\n    type: rouge\nTexte\n///\n');
assert.deepStrictEqual(issue.fixes.map((f) => f.title), ['success', 'error', 'info', 'warning'].map((v) => 'Remplacer par « ' + v + ' »'));

// Booléen écrit en français ou entre guillemets
src = '/// accordion | Titre\n    open: oui\nTexte\n///\n';
issue = only(src);
assert.strictEqual(word(src, issue), 'oui');
assert.strictEqual(fixed(src, issue), '/// accordion | Titre\n    open: true\nTexte\n///\n');
src = "/// accordion | Titre\n    open: 'false'\nTexte\n///\n";
assert.strictEqual(fixed(src, only(src)), '/// accordion | Titre\n    open: false\nTexte\n///\n');

// Option inconnue : clé soulignée, nom le plus proche, ou suppression de la ligne
src = '/// tile | Titre\n    pcto: buildings/city-hall\n    target: /\n///\n';
issue = only(src);
assert.strictEqual(word(src, issue), 'pcto');
assert.strictEqual(issue.fixes[0].title, 'Remplacer « pcto » par « picto »');
clean(fixed(src, issue));
assert.strictEqual(fixed(src, issue, 1), '/// tile | Titre\n    target: /\n///\n');

// Titre manquant ou en trop
src = '/// accordion\nTexte\n///\n';
issue = only(src);
assert.strictEqual(fixed(src, issue), '/// accordion | Titre\nTexte\n///\n');
src = '/// row | fr-grid-row--gutters\n/// col | 6\nA\n///\n///\n';
clean(src); // row et col acceptent un titre (classes)
src = '/// badge | Nouveau\nTexte\n///\n';
issue = only(src);
assert.strictEqual(word(src, issue), '| Nouveau');
assert.strictEqual(fixed(src, issue), '/// badge\nTexte\n///\n');

// Bloc non fermé : fermeture ajoutée après le premier paragraphe du contenu
src = '/// alert | Titre\nTexte de l\'alerte\nsur deux lignes\n\n## Suite de la page\n';
issue = only(src);
assert.strictEqual(issue.severity, 'warning');
assert.strictEqual(issue.range.line, 0);
assert.strictEqual(fixed(src, issue), '/// alert | Titre\nTexte de l\'alerte\nsur deux lignes\n///\n\n## Suite de la page\n');
clean(fixed(src, issue));
assert.strictEqual(issue.fixes[1].title, 'Fermer le bloc par « /// » à la fin de la page');
assert.strictEqual(fixed(src, issue, 1), src + '///\n');
src = '/// alert | Fin de page\nTexte';
issue = only(src);
assert.strictEqual(issue.fixes.length, 1);
assert.strictEqual(fixed(src, issue), '/// alert | Fin de page\nTexte\n///\n');
// Conteneur (onglets) : la fermeture va en fin de page, pas au milieu de ses onglets
src = '/// tabs\n/// tab | Un\n    selected: true\nA\n///\n\n/// tab | Deux\nB\n///\n';
issue = only(src);
assert.strictEqual(issue.range.line, 0);
assert.deepStrictEqual(issue.fixes.map((f) => f.title), ['Fermer le bloc par « /// » à la fin de la page']);
clean(fixed(src, issue));
// Bloc non fermé à cause d'un « ``` » orphelin : la cause est indiquée, pas de fermeture proposée
// (même schéma que la page Aidy : un « ``` » resté seul sous un titre en gras, avant l'entrée suivante)
src = '/// accordion | A\n- **Point**\n\n```\n- **Autre point**\n\n```\nCode\n```\n///\n\nSuite\n';
let issues = lint(src);
assert.deepStrictEqual(issues.map((i) => i.code + '@' + i.range.line), ['dsfr-unclosed@0', 'dsfr-fence-suspect@3']);
assert(issues[0].message.includes('le « ``` » de la ligne 4 semble en trop'), issues[0].message);
assert(issues[0].message.includes('Entre les lignes 1 et 10, le nombre de « ``` » est impair'), issues[0].message);
assert.strictEqual(issues[0].fixes.length, 0);
assert.strictEqual(issues[1].fixes.length, 0, 'le « ``` » désigné n\'est jamais supprimé automatiquement');
// Aucun « ``` » ne se distingue : la portion est donnée, sans désigner de ligne
src = '/// accordion | A\n- Point\n\n```\n- Autre point\n\n```\nCode\n```\n///\n';
issue = only(src);
assert(issue.message.includes('un « ``` » en trop ou non refermé'), issue.message);

// Nom de bloc inconnu : souligné, nom le plus proche proposé ; sa fermeture n'est pas signalée en plus
src = 'Texte\n\n/// alrt | Titre\nContenu\n///\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-unknown-block');
assert.strictEqual(issue.severity, 'error');
assert.strictEqual(word(src, issue), 'alrt');
assert.strictEqual(fixed(src, issue), src.replace('alrt', 'alert'));
clean(fixed(src, issue));
assert.strictEqual(only('/// zzzzzz\nX\n///\n').fixes.length, 0, 'aucun nom proche : pas de correction');

// « /// » qui ne ferme aucun bloc
src = '/// alert | A\nTexte\n///\n\nSuite\n\n///\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-orphan-close');
assert.strictEqual(issue.range.line, 6);
assert.strictEqual(fixed(src, issue), '/// alert | A\nTexte\n///\n\nSuite\n\n');
// … mais pas la fermeture d'un bloc invalide (déjà signalé)
assert.deepStrictEqual(lint('/// alert | A\n    type: rouge\nTexte\n///\n').map((i) => i.code), ['dsfr-invalid-block']);
// … ni un « /// » dans un bloc de code
clean('```\n///\n/// alrt\n```\n');

// Ligne de grille non fermée avant la suivante (page de rubrique réelle) : fermeture juste avant la ligne suivante
src = '/// row\n/// col\nA\n///\n/// row\n/// col\nB\n///\n///\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-unclosed');
assert(issue.message.includes('le « /// row » de la ligne 5 se retrouve imbriqué dedans'), issue.message);
assert.deepStrictEqual(issue.fixes.map((f) => f.title), ['Fermer le bloc par « /// » juste avant la ligne 5']);
clean(fixed(src, issue));
// Cas réel (page Estève) : ligne vide entre les deux lignes de cartes ; « /// » ajouté après la dernière fermeture
src = '/// row\n/// col\nA\n/// \n\n/// row\n/// col\nB\n///\n///\n';
issue = only(src);
assert.strictEqual(fixed(src, issue), '/// row\n/// col\nA\n/// \n///\n\n/// row\n/// col\nB\n///\n///\n');
clean(fixed(src, issue));
// Même nom plus profond (dans une colonne) : imbrication normale, pas de cette indication
issue = only('/// row\n/// col\n/// row\n/// col\nB\n///\n///\n///\n');
assert(!issue.message.includes('imbriqué dedans'), issue.message);

// Bouton à icône dans un groupe : classe ajoutée au groupe
src = '/// buttons\n/// button | Télécharger\n    icon: download-line\n    target: /doc.pdf\n///\n///\n';
issue = only(src);
assert.strictEqual(issue.range.line, 1);
assert.strictEqual(fixed(src, issue), '/// buttons\n    attrs: {class: fr-btns-group--icon-left}\n/// button | Télécharger\n    icon: download-line\n    target: /doc.pdf\n///\n///\n');
clean(fixed(src, issue));
src = '/// buttons\n    inline: inline\n/// button | Suite\n    icon: arrow-right-line\n    icon_place: right\n///\n///\n';
assert.strictEqual(fixed(src, only(src)), '/// buttons\n    inline: inline\n    attrs: {class: fr-btns-group--icon-right}\n/// button | Suite\n    icon: arrow-right-line\n    icon_place: right\n///\n///\n');

// Pictogramme introuvable : la valeur est soulignée, sans correction automatique
src = '/// tile | Titre\n    picto: inconnu/introuvable\n///\n';
issue = only(src);
assert.strictEqual(word(src, issue), 'inconnu/introuvable');
assert.strictEqual(issue.fixes.length, 0);

// Liste mal indentée (écart avec le site)
src = '- Puce\n\n  Suite à 2 espaces\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-list-indent');
assert.strictEqual(issue.range.line, 2);
assert.deepStrictEqual(createLinter({ mkdocsCompat: () => false })(src), [], 'réglage mkdocsCompat coupé : pas d\'avertissement');

// Sous-liste à 2 espaces : aplatie comme sur le site ; correction : l'indenter de 4 espaces
src = '- **D :** droit\n  - **D = 20** si 4 jours\n  - **D = 22.5** si 4,5 jours\n- **J :** jours\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-list-indent');
assert.strictEqual(issue.range.line, 1);
assert.strictEqual(fixed(src, issue), '- **D :** droit\n    - **D = 20** si 4 jours\n    - **D = 22.5** si 4,5 jours\n- **J :** jours\n');
clean(fixed(src, issue));
// Sous-sous-liste : chaque niveau passe à 4 espaces
src = '- a\n  - b\n    - c\n- d\n';
issue = only(src);
assert.strictEqual(fixed(src, issue), '- a\n    - b\n        - c\n- d\n');
clean(fixed(src, issue));

// En-tête de page : bandeau et fil d'Ariane, soulignés à leur ligne dans l'en-tête
src = '---\ntitle: Page\nnotice:\n  type: warnng\n  description: Texte\n---\n\n# Page\n';
issue = only(src);
assert.strictEqual(word(src, issue), 'warnng');
assert.strictEqual(fixed(src, issue), src.replace('warnng', 'warning'));
src = '---\nbreadcrumb:\n  - Accueil\n  - Guides: /guides/\n  - Page\n---\n';
issue = only(src);
assert.strictEqual(issue.severity, 'error');
assert.strictEqual(word(src, issue), 'breadcrumb');
// La liste du fil d'Ariane n'est pas prise pour une liste Markdown de la page
clean('---\nbreadcrumb:\n  - Accueil: /\n  - Page\nsummary: true\n---\n\n# Titre\n');

// Mise en exergue : son contenu est réanalysé à part, sans numéros de ligne fiables : rien n'est signalé
clean('> /// alert\n>     type: rouge\n');

// Blocs de code : ignorés
clean('```\n/// alert\n    type: rouge\n```\n');

// Pages d'exemple : demo.md sans problème ; erreurs.md, un problème par section (hors en-tête YAML, traité à part)
const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');
assert.deepStrictEqual(lint(sample('demo.md')), []);
assert.strictEqual(lint(sample('erreurs.md')).length, 9);

// Gras mal fermé (« **limites **à ») : rendu qui dépend de la version de Python-Markdown du site
src = 'Il a des **limites **à garder, et du **gras** normal.\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-loose-strong');
assert.strictEqual(word(src, issue), '**limites **');
assert.strictEqual(fixed(src, issue), 'Il a des **limites** à garder, et du **gras** normal.\n');
clean(fixed(src, issue));
clean('Un ** espace ** autour : non signalé.\n');
// Gras appariés dans l'ordre (cas réel Doc SIRH) : pas de faux signalement
clean('**G**estion de l’**A**rchivage et du stockage **U**nifiés du\n**D**ossier **I**ndividuel agent\n');
clean('Du `**code **x` en ligne : ignoré.\n');

// Titre sans espace après les « # » (cas réel) : titre sur le site, espace proposé
src = 'Intro\n\n###Rechercher l’acte à modifier\n\nTexte\n';
issue = only(src);
assert.strictEqual(issue.code, 'dsfr-heading-space');
assert.strictEqual(issue.severity, 'warning');
assert.strictEqual(word(src, issue), '###Rechercher l’acte à modifier');
assert(issue.message.includes('« ### Titre »'), issue.message);
assert.strictEqual(issue.fixes[0].title, 'Ajouter un espace après « ### »');
assert.strictEqual(fixed(src, issue), 'Intro\n\n### Rechercher l’acte à modifier\n\nTexte\n');
clean(fixed(src, issue));
assert.strictEqual(only('#######Sept\n').fixes.length, 0, '7 « # » : pas de correction évidente');
clean('```\n#!/bin/bash\n```\n');
clean('    ###code indenté\n');
clean('---\n# commentaire YAML\ntitle: x\n---\n\n# Titre\n');
assert.deepStrictEqual(createLinter({ mkdocsCompat: () => false })('###Titre\n'), [], 'réglage mkdocsCompat coupé');

// Fins de ligne Windows
src = '/// alert | Titre\r\n    type: warnig\r\nTexte\r\n///\r\n';
issue = only(src);
assert.strictEqual(word(src.replace(/\r/g, ''), issue), 'warnig');

assert.strictEqual(closest('sucess', ['success', 'error']), 'success');
assert.strictEqual(closest('zzz', ['success', 'error']), null);

console.log('Problèmes dans l\'éditeur : positions et corrections rapides OK');
