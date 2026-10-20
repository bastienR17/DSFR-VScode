// Vérifie le signalement des erreurs et le rendu désactivé
const MarkdownIt = require('markdown-it');
const dsfr = require('../lib/dsfr-markdown-it.js');
const assert = require('assert');
function render(src, enabled = true) {
  const md = new MarkdownIt({ html: true });
  dsfr(md, { isEnabled: () => enabled, showErrors: () => true });
  return md.render(src, {});
}
const cases = [
  ["/// alert | T\n    foo: bar\nX\n///\n", 'Option inconnue « foo »'],
  ["/// alert | T\n    type: rouge\nX\n///\n", 'Valeur « rouge » invalide pour « type »'],
  ["/// badge | arg\nX\n///\n", 'n\'accepte pas de titre'],
  ["/// accordion\nX\n///\n", 'doit avoir un titre'],
  ["/// accordion | A\n    open: 'true'\nX\n///\n", 'true ou false'],
  ["/// alert | Non fermé\nX\n", 'jamais fermé'],
  ["/// tile | T\n    picto: inconnu/nope\nX\n///\n", 'Pictogramme « inconnu/nope » introuvable'],
  ["/// alert | T\n    type success\nX\n///\n", 'Options illisibles'],
  ["- a\n  - sous a\n- b\n", 'cette sous-liste ne sera pas imbriquée'],
  ["- La date\n\n  Ceci pour éviter\n- Le code\n", 'ce texte sortira de la liste'],
];
for (const [src, expected] of cases) {
  const html = render(src);
  assert(html.includes(expected), 'Attendu « ' + expected + ' » dans :\n' + html);
}
// Mode désactivé : pas de classes DSFR, texte brut affiché
const off = render("/// alert | Titre\n    type: success\nTexte\n///\n\n> cit\n", false);
assert(!off.includes('fr-alert'), off);
assert(off.includes('/// alert | Titre') && off.includes('data-enabled="false"'), off);
assert(off.includes('<blockquote>'), off);
const on = render("/// alert | Titre\nX\n///\n");
assert(on.includes('data-enabled="true"') && on.includes('fr-alert'), on);
// Adresses dangereuses neutralisées dans les options (comme markdown-it le fait pour les liens)
const unsafe = render("/// button | Clic\n    target: javascript:alert(1)\n///\n\n/// card | Carte\n    target: JaVaScRiPt:alert(1)\n    image: javascript:alert(2)\n///\n");
assert(!/javascript:/i.test(unsafe), unsafe);
const safe = render("/// button | Lien\n    target: https://exemple.fr/page\n///\n");
assert(safe.includes('href="https://exemple.fr/page"'), safe);
// Guillemets dans les options texte : toujours échappés (aucun attribut HTML injecté)
const { BLOCKS } = require('../lib/options');
let injected = 0;
for (const name of Object.keys(BLOCKS)) {
  for (const key of Object.keys(BLOCKS[name].options)) {
    if (BLOCKS[name].options[key][1].name !== 'tString') continue;
    const head = '/// ' + name + (BLOCKS[name].arg === true ? ' | Titre' : '');
    const html = render(head + "\n    " + key + ": 'x\" onx=\"1'\nTexte\n///\n");
    assert(!html.includes('" onx="'), name + '.' + key + ' : ' + html);
    injected++;
  }
}
assert(injected > 20);
// attr_list : noms d'attributs invalides et gestionnaires d'événements ignorés
const attrHtml = render('Texte\n{: data-x="1" onclick="alert(1)" a"b=1 }\n');
assert(attrHtml.includes('<p data-x="1">') && !attrHtml.includes('onclick') && !attrHtml.includes('a"b'), attrHtml);
// Pas d'avertissement pour une liste correctement indentée
const good = render("- a\n    - sous a\n\n    suite\n- b\n");
assert(!good.includes('dsfr-preview-error'), good);
console.log('Erreurs et mode désactivé : ' + (cases.length + 6 + injected) + ' vérifications OK');
