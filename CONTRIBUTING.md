# Contribuer

Merci de votre intérêt ! Ce document explique comment le projet est organisé, comment le tester
et comment publier une version.

## Prérequis

- Node.js 22 ou plus récent
- Python 3.10 ou plus récent (tests de parité avec le site)
- VS Code 1.75 ou plus récent

```bash
npm install
pip install -r requirements-dev.txt
python -m playwright install chromium   # seulement pour le test navigateur
```

## Lancer l'extension en développement

Ouvrir le dossier dans VS Code et appuyer sur **F5** (configuration « Lancer l'extension ») :
une seconde fenêtre s'ouvre sur le dossier [`samples/`](samples/), avec l'extension chargée depuis les sources.
Ouvrir `demo.md` ou `erreurs.md`, puis l'aperçu (**Ctrl+K V**). Après une modification du code,
recharger cette fenêtre (**Ctrl+R**).

## Organisation du code

L'extension ne crée pas son propre aperçu : elle enrichit l'aperçu Markdown intégré à VS Code.

```
extension.js              point d'entrée VS Code : réglages, commandes, indicateur de la barre d'état
lib/
  dsfr-markdown-it.js     plugin markdown-it : règles d'analyse et de rendu, assemblage des modules
  options.js              blocs connus, options autorisées, lecture du YAML des options
  components.js           HTML de chaque bloc /// (alerte, carte, tuile…)
  page-meta.js            en-tête YAML : bandeau, fil d'Ariane, sommaire, lettre d'information
  frontmatter.js          lecture de l'en-tête YAML, détection et correction des valeurs contenant « : »
  mkdocs-compat.js        écarts entre markdown-it et Python-Markdown
  html.js                 échappement HTML et encadrés d'erreur
  vendor/                 js-yaml et markdown-it-deflist (fichiers tiers, non modifiés)
media/
  dsfr/                   CSS, polices, icônes et pictogrammes du DSFR (copiés du thème mkdocs-dsfr)
  dsfr-preview.css        ajustements de l'aperçu et style des encadrés d'erreur
  dsfr-preview.js         script de l'aperçu : thème, accordéons, onglets, sommaire
snippets/dsfr.json        snippets d'insertion des composants
samples/                  pages d'exemple (démonstration et erreurs)
test/                     tests (voir ci-dessous)
scripts/captures.py       régénère les captures d'écran du README
```

Le plugin (`lib/`) ne dépend pas de VS Code : il se teste avec Node seul.

Deux points à connaître avant de modifier le code :

- **Le contenu de l'aperçu est inséré après le chargement de `dsfr-preview.js`**, puis remplacé à
  chaque frappe. Le script surveille donc le contenu (MutationObserver) au lieu de supposer qu'il est
  présent, et mémorise l'état des accordéons et onglets d'un rendu à l'autre.
- **Les réglages sont relus à chaque rendu** : les options passées au plugin sont des fonctions.
  Un changement de réglage ne demande qu'un rafraîchissement de l'aperçu.

## Tests

```bash
npm test               # tests Node + parité avec le site
npm run test:js        # tests Node seuls (rapides, sans Python)
npm run test:python    # parité avec le site
npm run test:browser   # script de l'aperçu dans Chromium
```

| Fichier | Ce qui est vérifié |
|---|---|
| `test/compare.py` | Le HTML de l'extension est identique à celui du vrai moteur du site (Python-Markdown + `dsfr_structure` 0.12), sur les cas de test officiels de `dsfr_structure` et sur `test/cases.json`. Les quelques écarts voulus sont listés dans le script. |
| `test/doc_check.py` | Les 41 exemples de la [documentation du thème](https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/) (`test/doc_examples.py`) : rendu identique au site, aucune erreur signalée. |
| `test/errors.js` | Signalement des erreurs, adresses dangereuses neutralisées, rendu désactivé. |
| `test/frontmatter.js` | Composants de l'en-tête YAML et leurs erreurs. |
| `test/frontmatter-fix.js` | Détection et correction des en-têtes illisibles (valeurs contenant « : »). |
| `test/frontmatter_mkdocs.py` | Avec le lecteur de métadonnées de MkDocs : l'en-tête fautif est ignoré, l'en-tête corrigé est lu. |
| `test/snippets.js` | Chaque snippet produit un composant valide. |
| `test/samples.js` | `demo.md` ne signale aucune erreur ; `erreurs.md` en signale une par section. |
| `test/extension-host.js` | `extension.js` avec une API VS Code simulée : réglages, commandes déclarées, aperçu à côté, fenêtre séparée, soulignement et correction des en-têtes. |
| `test/preview_browser.py` | `dsfr-preview.js` dans Chromium, avec le chargement différé de VS Code. |

Pour comparer une page réelle : `cd test && python3 page.py chemin/vers/page.md`
(les deux rendus sont écrits dans `/tmp/page_py.html` et `/tmp/page_js.html`).

**Corriger un écart de rendu** : ajouter le Markdown concerné à `test/cases.json`, vérifier que
`compare.py` le signale, corriger, puis relancer toute la suite.

`markdown-it` reste en version 14 dans les dépendances de développement : c'est la version utilisée
par l'aperçu de VS Code.

## Mettre à jour le DSFR

Les fichiers de `media/dsfr/` viennent du thème `mkdocs-dsfr` (actuellement 0.26.1, DSFR 1.15.2).
Quand le site passe à une nouvelle version du thème :

```bash
pip download mkdocs-dsfr==<version> --no-deps -d /tmp/theme
cd /tmp/theme && unzip -q *.whl
```

Copier ensuite depuis `dsfr/` vers `media/dsfr/` : `dsfr.min.css`, `utility/utility.min.css`,
`css/theme.css`, `fonts/`, `icons/` et `artwork/pictograms/`. Si `dsfr_structure` change aussi de
version, mettre à jour `requirements-dev.txt`, relancer `npm test` et reporter les nouveautés dans
`lib/options.js` et `lib/components.js`.

## Publier une version

1. Mettre à jour `version` dans `package.json` et ajouter une entrée dans `CHANGELOG.md`.
2. Si le rendu a changé, régénérer les captures : `python3 scripts/captures.py`.
3. Créer et pousser une étiquette :
   ```bash
   git tag v0.8.0
   git push origin v0.8.0
   ```
4. La CI teste, construit le `.vsix` et le joint à une Release GitHub.

Pour construire le `.vsix` localement : `npm run package`.

Rappel : le DSFR étant réservé aux services de l'État, l'extension n'est **pas** publiée sur le
Marketplace public de VS Code.
