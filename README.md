# Aperçu DSFR pour Markdown

[![CI](https://github.com/bastienR17/dsfr-markdown-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/bastienR17/dsfr-markdown-preview/actions/workflows/ci.yml)
![VS Code 1.75+](https://img.shields.io/badge/VS%20Code-1.75%2B-0066b8)
![Licence MIT](https://img.shields.io/badge/licence-MIT-green)

Extension VS Code qui affiche, dans l'aperçu Markdown, **le rendu exact d'une page écrite pour un site
[MkDocs DSFR](https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/)** :
alertes, accordéons, cartes, tuiles, onglets, bandeau, fil d'Ariane… avec les styles, polices et icônes
du [Système de Design de l'État](https://www.systeme-de-design.gouv.fr/).


| Thème clair | Thème sombre |
|---|---|
| ![Aperçu DSFR en thème clair](docs/images/apercu-clair.png) | ![Aperçu DSFR en thème sombre](docs/images/apercu-sombre.png) |

> **Usage réservé à l'administration.** Le DSFR et la marque de l'État (dont la police Marianne)
> sont réservés aux sites et services publics ([conditions d'utilisation](https://www.systeme-de-design.gouv.fr/cgu/)).
> Cette extension s'adresse donc aux services qui rédigent une documentation avec le thème MkDocs DSFR,
> et n'est pas publiée sur le Marketplace public de VS Code.
>
> Projet indépendant, non affilié au Service d'information du Gouvernement ni aux mainteneurs du thème mkdocs-dsfr.

## Fonctionnalités

- **Tous les composants du thème** : les 15 blocs de `dsfr_structure` (`/// alert`, `/// accordion`,
  `/// card`, `/// tile`, `/// tabs`, `/// buttons`, `/// row` / `/// col`…), les citations `>` en
  mise en exergue, les tableaux DSFR avec légende, les encadrés `!!!` et `???`.
- **L'en-tête de page** : bandeau d'information, fil d'Ariane, sommaire et lettre d'information déclarés
  dans le YAML en haut du fichier, placés comme sur le site.
- **Un rendu fidèle au site** : le HTML produit est comparé automatiquement à celui du vrai moteur
  du site (Python-Markdown + `dsfr_structure`), et les 41 exemples de la documentation officielle du thème sont testés.
  L'aperçu reproduit aussi les règles Markdown du site là où elles diffèrent de celles de VS Code.
- **Les erreurs signalées avant la mise en ligne** : option inconnue, valeur invalide, bloc non fermé,
  pictogramme introuvable, liste mal indentée… et les en-têtes YAML illisibles, soulignés dans l'éditeur
  et corrigés en un clic, fichier par fichier ou pour tout le dossier.
- **Interactif** : accordéons, onglets, fil d'Ariane et sommaire cliquables ; thème clair ou sombre aligné sur VS Code.
- **Aperçu à côté du Markdown** en un clic, ou dans une fenêtre séparée à placer sur un second écran.
- **22 snippets** pour insérer les composants sans retenir leur syntaxe.

![Erreurs signalées dans l'aperçu](docs/images/erreurs.png)

## Installation

1. Télécharger le fichier `.vsix` de la dernière version dans les
   [Releases](https://github.com/bastienR17/dsfr-markdown-preview/releases).
2. Dans VS Code : panneau **Extensions** → menu **⋯** → **Installer à partir d'un VSIX…**
   (ou en ligne de commande : `code --install-extension dsfr-markdown-preview-<version>.vsix`).
3. Recharger la fenêtre : **Ctrl+Maj+P** → **Developer: Reload Window**.

Pour mettre à jour, installer le nouveau `.vsix` de la même façon.

## Utilisation

Ouvrir un fichier `.md`, puis cliquer sur le bouton **Ouvrir l'aperçu DSFR** en haut à droite de l'éditeur
(ou **Ctrl+Alt+D**, **Cmd+Maj+Alt+D** sur macOS) : l'écran se partage en deux, **le Markdown à gauche et
l'aperçu à droite**, et le curseur reste dans le Markdown pour continuer à écrire.

| Action | Comment |
|---|---|
| Aperçu à côté (par défaut) | Bouton **Ouvrir l'aperçu DSFR**, **Ctrl+Alt+D**, ou clic droit sur le fichier → **Ouvrir l'aperçu DSFR à côté** |
| Aperçu dans une fenêtre séparée | Clic droit sur le fichier ou son onglet → **Ouvrir l'aperçu DSFR dans une nouvelle fenêtre** |
| Aperçu à la place de l'éditeur | **Ctrl+Maj+V** (commande standard de VS Code) |

Pour que le bouton et **Ctrl+Alt+D** ouvrent plutôt une fenêtre séparée (pratique avec un second écran),
régler `dsfrPreview.openMode` sur `window`. La fenêtre séparée nécessite VS Code 1.85 ou plus récent.

Le rendu se met à jour pendant la saisie. L'indicateur **DSFR** de la barre d'état montre si le rendu est
actif ; un clic l'active ou le désactive pour revenir à l'aperçu standard de VS Code.

### Snippets

Dans un fichier Markdown, taper `dsfr-` puis **Ctrl+Espace**. Les valeurs possibles (type d'alerte,
couleur…) se choisissent dans une liste ; **Tab** passe au champ suivant.

| Raccourci | Composant |
|---|---|
| `dsfr-entete` | En-tête de page (fil d'Ariane, sommaire), tout en haut du fichier |
| `dsfr-bandeau`, `dsfr-fil-ariane`, `dsfr-sommaire`, `dsfr-lettre-info` | Clés à ajouter dans l'en-tête `---` |
| `dsfr-alerte`, `dsfr-alerte-simple` | Alerte avec ou sans titre |
| `dsfr-accordeon` | Accordéon |
| `dsfr-badge`, `dsfr-badge-couleur` | Badge |
| `dsfr-mise-en-avant` | Mise en avant (callout) |
| `dsfr-citation`, `dsfr-exergue` | Citation, mise en exergue |
| `dsfr-carte`, `dsfr-tuile` | Carte, tuile |
| `dsfr-grille` | Ligne de grille à deux colonnes |
| `dsfr-onglets` | Système d'onglets |
| `dsfr-boutons`, `dsfr-bouton` | Groupe de boutons, bouton |
| `dsfr-image`, `dsfr-video` | Contenu média |
| `dsfr-tableau` | Tableau avec légende |

Pour que les suggestions apparaissent sans **Ctrl+Espace**, ajouter dans les réglages :

```json
"[markdown]": { "editor.quickSuggestions": { "other": "on" } }
```

## Syntaxe en bref

Un bloc commence par `/// nom | titre`, ses options sont indentées de **4 espaces** juste en dessous,
et il se ferme par `///` :

```markdown
/// alert | Prérequis
    type: warning
Vérifiez que le dossier est **complet**.
///
```

Les composants uniques par page se déclarent dans l'en-tête YAML :

```markdown
---
notice:
  type: warning
  description: "Texte du bandeau : entre guillemets s'il contient « : »"
breadcrumb:
  - Accueil: /
  - Guides: /guides/
  - Titre de la page courante
summary: true
---
```

La syntaxe complète et toutes les options sont décrites dans la
[documentation du thème MkDocs DSFR](https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/).
Le dossier [`samples/`](samples/) contient une page de démonstration de tous les composants et une page d'erreurs courantes.

## Fidélité au site

Le site est généré par MkDocs avec **Python-Markdown**, alors que l'aperçu de VS Code utilise **markdown-it**.
Là où les deux moteurs diffèrent, l'aperçu reproduit le comportement du site (réglage `dsfrPreview.mkdocsCompat`) :

- une liste collée à un paragraphe, sans ligne vide, reste du texte ;
- un `\` en fin de ligne reste affiché et ne crée pas de retour à la ligne ;
- un contenu de liste indenté de moins de 4 espaces est signalé (sur le site, il sort de la liste) ;
- les attributs `{: .classe }` (`attr_list`) et les listes de définitions (`def_list`) sont pris en charge.

L'aperçu signale aussi deux particularités du thème : le titre `title` du bandeau d'en-tête n'est pas
affiché par mkdocs-dsfr 0.26.1, et un bouton à icône placé dans un groupe `/// buttons` est réduit à son
icône si le groupe n'a pas la classe `fr-btns-group--icon-left` ou `--icon-right`.

## En-têtes YAML illisibles

Erreur fréquente dans les en-têtes générés automatiquement : une valeur qui contient elle-même « : ».

```markdown
---
title: mentor: Déposer les documents      ← illisible
---
```

MkDocs ne signale rien : il ignore tout l'en-tête et l'affiche comme du texte en haut de la page
(une ligne horizontale puis « title: mentor: … » en titre), et les métadonnées sont perdues.
L'extension souligne la ligne fautive dans l'éditeur et l'explique dans l'aperçu. Pour corriger :

- **un fichier** : ampoule sur la ligne soulignée (ou **Ctrl+.**) → *Mettre entre guillemets les valeurs qui contiennent « : »* ;
- **tout le dossier** : palette de commandes (**Ctrl+Maj+P**) → **DSFR : Corriger les en-têtes YAML des fichiers Markdown**.
  La liste des fichiers concernés est affichée avant toute modification.

Résultat : `title: 'mentor: Déposer les documents'`. Si les en-têtes sont produits par un script,
le mieux est de corriger aussi ce script pour qu'il mette les valeurs entre guillemets.

## Réglages

| Réglage | Valeurs | Par défaut | Rôle |
|---|---|---|---|
| `dsfrPreview.enabled` | `true`, `false` | `true` | Appliquer le rendu DSFR |
| `dsfrPreview.theme` | `auto`, `light`, `dark` | `auto` | Thème DSFR (`auto` suit VS Code) |
| `dsfrPreview.showErrors` | `true`, `false` | `true` | Afficher les encadrés d'erreur et souligner les en-têtes illisibles |
| `dsfrPreview.mkdocsCompat` | `true`, `false` | `true` | Reproduire les règles Markdown du site |
| `dsfrPreview.openMode` | `side`, `window` | `side` | Où s'ouvre l'aperçu : à côté du Markdown ou dans une fenêtre séparée |

## Limites connues

- Seul le contenu de la page est rendu : pas d'en-tête, de menu ni de pied de page du site.
- Le JavaScript officiel du DSFR n'est pas chargé : accordéons, onglets et sommaire sont reproduits par un petit script.
- Les chemins d'images sont résolus par rapport au fichier `.md`, comme le fait VS Code.
- Les pictogrammes des tuiles sont intégrés en SVG : le rendu est identique, le HTML diffère légèrement du site.
- Version de référence : thème mkdocs-dsfr 0.26.1, `dsfr_structure` 0.12, DSFR 1.15.2.

## Contribuer

Le fonctionnement interne, les tests et la procédure de publication sont décrits dans
[CONTRIBUTING.md](CONTRIBUTING.md). En bref :

```bash
npm install
pip install -r requirements-dev.txt
npm test
```

Puis **F5** dans VS Code pour lancer l'extension sur les pages d'exemple.

## Licence

Code du projet sous [licence MIT](LICENSE). Les fichiers du DSFR, du thème mkdocs-dsfr et des
bibliothèques incluses gardent leur propre licence : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
