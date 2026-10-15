# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## 0.8.1 — octobre 2026

### Corrections
- Dépôt : fichiers de configuration rétablis (intégration continue `.github/`, `.gitignore`,
  `.vscodeignore`, `.vscode/`, `.editorconfig`), fichier système `.DS_Store` retiré.
- Adresse du dépôt corrigée dans `package.json` et le README (`bastienR17/DSFR-VScode`).

## 0.8.0 — octobre 2026

### Ajouts
- En-têtes YAML dont une valeur contient « : » (par exemple `title: mentor: …`) : la ligne est soulignée
  dans l'éditeur et une correction rapide (ampoule) met la valeur entre guillemets.
- Commande **DSFR : Corriger les en-têtes YAML des fichiers Markdown** : corrige tout le dossier,
  après confirmation, en conservant les fins de ligne.
- Message de l'aperçu plus précis : il explique ce que le site affichera (MkDocs ignore l'en-tête et
  l'affiche comme du texte) et donne la ligne corrigée.

### Interne
- Nouveau module `lib/frontmatter.js`, partagé par l'aperçu et l'éditeur.
- Tests : `test/frontmatter-fix.js`, et `test/frontmatter_mkdocs.py` qui vérifie les corrections
  avec le lecteur de métadonnées de MkDocs.

## 0.7.0 — octobre 2026

### Modifications
- Le bouton **Ouvrir l'aperçu DSFR** et **Ctrl+Alt+D** partagent désormais l'écran en deux :
  le Markdown à gauche, l'aperçu à droite, et le curseur reste dans le Markdown.
- Nouveau réglage `dsfrPreview.openMode` (`side` par défaut, ou `window`) pour choisir où s'ouvre l'aperçu.
- Clic droit sur un fichier Markdown ou sur son onglet : « Ouvrir l'aperçu DSFR à côté » et
  « Ouvrir l'aperçu DSFR dans une nouvelle fenêtre ».
- Le bouton utilise une icône distincte de celle de l'aperçu Markdown natif de VS Code.

## 0.6.0 — octobre 2026

Première version publique.

### Ajouts
- Avertissement quand un bouton à icône est placé dans un groupe `/// buttons` sans classe
  `fr-btns-group--icon-left`/`--icon-right` : le DSFR le réduit alors à son icône sur le site.
- Pages d'exemple `samples/demo.md` (tous les composants) et `samples/erreurs.md` (erreurs courantes),
  utilisées par la configuration de débogage **F5** et vérifiées par les tests.
- Intégration continue GitHub Actions : tests, construction du `.vsix`, Release automatique sur étiquette `v*`.
- Test navigateur du script de l'aperçu dans les conditions de chargement de VS Code.

### Corrections
- La bascule « Activer / désactiver l'aperçu DSFR » écrit le réglage au niveau où il est défini
  (dossier, espace de travail ou utilisateur) : elle était sans effet si un réglage d'espace de travail existait.
- Les adresses fournies dans les options (`target`, `link_url`, `image`…) sont vérifiées comme les liens
  Markdown : les adresses `javascript:` sont neutralisées.
- Le script de l'aperçu reconnaît ses feuilles de style par leur chemin, quel que soit le dossier
  d'installation (il dépendait du nom du dossier de l'extension).

### Interne
- Plugin découpé en modules (`options`, `components`, `page-meta`, `mkdocs-compat`, `html`) et commenté.
- Dépendances de développement regroupées dans le `package.json` racine ; `npm run package` utilise `vsce` localement.
- Fichiers de l'aperçu renommés `media/dsfr-preview.js` et `media/dsfr-preview.css`.
- Code sous licence MIT ; mentions des composants tiers dans `THIRD_PARTY_NOTICES.md`.

## 0.5.0 — octobre 2026

- Nouvelle commande « Ouvrir l'aperçu DSFR dans une nouvelle fenêtre » : bouton dans la barre de titre
  des fichiers Markdown, raccourci Ctrl+Alt+D, clic droit dans l'explorateur et sur l'onglet.
  La fenêtre séparée suit le fichier Markdown actif (VS Code 1.85 minimum, sinon aperçu à côté).

## 0.4.0 — octobre 2026

Alignement sur la documentation officielle du thème
(https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/) :

- Les 41 exemples de code de la documentation sont vérifiés automatiquement (`test/doc_check.py`) :
  rendu identique au site, sans erreur.
- Composants déclarés dans l'en-tête YAML de la page : bandeau (`notice`), fil d'Ariane (`breadcrumb`),
  sommaire (`summary`, liens cliquables) et lettre d'information (`newsletter`), placés comme sur le site.
- Erreurs d'en-tête signalées : YAML illisible (souvent un « : » sans guillemets), fil d'Ariane mal formé,
  type de bandeau inconnu. Le titre `title` du bandeau est signalé car le thème 0.26.1 ne l'affiche pas.
- Le composant `/// notice`, déprécié par le thème, est signalé.
- Extensions recommandées par la documentation : `attr_list` (`{: .classe }`) et `def_list` (listes de définitions).
- Snippets : en-tête de page, bandeau, fil d'Ariane, sommaire, lettre d'information ; légende de tableau en dernière ligne.

## 0.3.1 — octobre 2026

- Correction : dans VS Code, les styles DSFR pouvaient être désactivés au premier affichage
  (alertes sans style, accordéons et onglets inactifs). VS Code insère le contenu de l'aperçu après
  le chargement des scripts : le script attend maintenant que le contenu soit présent.
- Nouveau test navigateur (`test/preview_browser.py`) qui reproduit ce fonctionnement de VS Code.

## 0.3.0 — octobre 2026

- Fidélité au Markdown du site (Python-Markdown), réglable avec `dsfrPreview.mkdocsCompat` :
  une liste collée à un paragraphe reste du texte, `\` en fin de ligne reste affiché,
  et les contenus de liste indentés de moins de 4 espaces sont signalés.
- Le bouton du fil d'Ariane DSFR (`fr-breadcrumb`) et tous les boutons qui ouvrent un bloc `fr-collapse` fonctionnent dans l'aperçu.
- Correction : les « \ » des textes alternatifs d'images (ex. `C:\Users\…`) ne sont plus perdus.

## 0.2.0 — octobre 2026

- Le rendu DSFR s'applique à tous les fichiers Markdown : il ne dépend plus de la présence d'un `mkdocs.yml` avec le thème DSFR.
- Le réglage `dsfrPreview.activation` est remplacé par `dsfrPreview.enabled` (activé par défaut).
- Les encadrés `!!!` et `???` sont toujours rendus.

## 0.1.0 — octobre 2026

- Première version.
- Rendu DSFR dans l'aperçu Markdown des 15 composants de dsfr_structure 0.12 : alerte, accordéon, badge, mise en avant, carte, tuile, grille (ligne et colonne), bandeau d'information, citation, contenu média, onglets, boutons.
- Mise en exergue des citations « > » et tableaux DSFR avec légende `[…]`, comme sur le site.
- Encadrés `!!!` (admonition) et `???` (pymdownx.details).
- Styles, polices, icônes et pictogrammes du thème mkdocs-dsfr 0.26.1 (DSFR 1.15.2).
- Thème clair ou sombre aligné sur VS Code ; accordéons et onglets cliquables.
- Signalement des blocs mal écrits.
- Activation automatique sous un mkdocs.yml DSFR, bouton dans la barre d'état.
- 18 snippets pour insérer les composants.
