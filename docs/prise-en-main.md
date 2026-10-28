# Prise en main en 5 minutes

Ce guide s'adresse aux rédacteurs de Doc SIRH qui découvrent l'extension. Il suffit de VS Code et du
fichier `.vsix` : rien d'autre à installer (ni Python, ni MkDocs).

## 1. Installer

1. Récupérer le fichier `dsfr-markdown-preview-<version>.vsix` (onglet
   [Releases](https://github.com/bastienR17/DSFR-VScode/releases), ou transmis par l'équipe).
2. Dans VS Code : panneau **Extensions** (**Ctrl+Maj+X**) → menu **⋯** en haut du panneau →
   **Installer à partir d'un VSIX…** → choisir le fichier.
3. Recharger la fenêtre : **Ctrl+Maj+P** → taper `Reload Window` → **Entrée**.

L'indicateur **DSFR** apparaît en bas, dans la barre d'état : le rendu est actif.

## 2. Ouvrir l'aperçu

Ouvrir une page `.md` (par exemple un mode opératoire), puis cliquer sur le bouton **Ouvrir l'aperçu DSFR**
en haut à droite de l'éditeur, ou **Ctrl+Alt+D** (**Cmd+Maj+Alt+D** sur Mac).

L'écran se partage : le Markdown à gauche, la page telle qu'elle s'affichera sur Doc SIRH à droite.
L'aperçu se met à jour à chaque frappe, et suit la page ouverte quand on change d'onglet.

L'aperçu montre la page entière comme sur le site : en-tête, menu latéral (le sommaire de la page,
cliquable), contenu et pied de page. Pour ne voir que le contenu : réglage `dsfrPreview.pageLayout` → `content`.
Pour voir la page à la largeur d'un ordinateur (les cartes passent à la ligne comme sur le site) :
réglage `dsfrPreview.desktopWidth`.

> Avec deux écrans : clic droit sur l'onglet du fichier → **Ouvrir l'aperçu DSFR dans une nouvelle fenêtre**,
> puis glisser la fenêtre sur le second écran.

Dans le Markdown, les blocs `///` sont colorés (nom, titre, options, fermeture) et la flèche dans la
marge replie un bloc jusqu'à son `///` : pratique pour s'y retrouver dans une longue page.

## 3. Insérer un composant

Sur une ligne vide, taper `dsfr-` : la liste des composants s'ouvre toute seule.

| Pour… | Taper |
|---|---|
| une nouvelle page de mode opératoire complète | `dsfr-sirh-modop` |
| une consigne (encadré en italique) | `dsfr-sirh-consigne` |
| une capture d'écran | `dsfr-sirh-capture` (ou `dsfr-img` pour une image simple) |
| le chemin dans l'application (`⮡ Domaine › …`) | `dsfr-sirh-chemin` |
| une nouvelle ligne du suivi des modifications, datée du jour | `dsfr-sirh-version` |
| 2 ou 3 cartes, 2 ou 3 tuiles côte à côte | `dsfr-carte-2`, `dsfr-sirh-cartes-3`, `dsfr-tuile-3`… |
| une alerte, un accordéon | `dsfr-alerte`, `dsfr-accordeon` |

Continuer à taper filtre la liste, **Entrée** insère le composant. Les zones à remplir sont surlignées :
**Tab** passe à la suivante. Quand une liste de choix s'affiche (type d'alerte, pictogramme…), choisir
avec les flèches puis **Entrée**.

La liste complète est dans le [README](../README.md#snippets).

## 4. Corriger une erreur

L'extension vérifie la page ouverte pendant la frappe :

- **souligné rouge** : le bloc s'affichera en texte brut sur le site, à corriger ;
- **souligné orange** : rendu différent sur le site, ou bloc mal fermé ;
- **pointillés bleus** : conseil (image sans description, lien absolu vers une page du site).

Pour corriger :

1. Placer le curseur sur le mot souligné : l'explication s'affiche au survol.
2. Cliquer sur l'**ampoule** jaune (ou **Ctrl+.**, **Cmd+.** sur Mac) et choisir la correction proposée,
   par exemple `type: warnig` → `warning`.

L'extension ne modifie jamais la page toute seule : chaque correction demande un clic.

Pour retrouver tous les problèmes de la page : cliquer sur le compteur **⚠ N DSFR** en bas, ou clic droit
dans le Markdown → **DSFR : Problèmes de la page**. Choisir un problème place le curseur dessus.
Dans l'aperçu, un **double-clic** sur un encadré d'erreur ramène aussi à la bonne ligne.

![Erreurs signalées dans l'aperçu](images/erreurs.png)

## 5. Les erreurs les plus fréquentes

| Symptôme | Cause habituelle | Correction |
|---|---|---|
| « Bloc jamais fermé » | un `///` oublié à la fin d'un bloc, ou un « ``` » en trop plus haut | ampoule → *Fermer le bloc*, ou supprimer le « ``` » indiqué dans le message |
| Option ou valeur invalide | faute de frappe (`pcto`, `warnig`) ou mot français (`oui`) | ampoule → la valeur proposée |
| Options du bloc ignorées | options pas indentées de **4 espaces** sous `/// nom` | ré-indenter les lignes d'options |
| En-tête affiché en texte en haut de la page | une valeur de l'en-tête YAML contient « : » | ampoule → *Mettre entre guillemets…* |
| Mot en gras qui affiche `**` sur le site | espace avant les `**` fermantes (`**texte **suite`) | ampoule → *Coller les \*\* au mot* |
| Titre affiché en texte dans le wiki GitLab | pas d'espace après les `#` (`###Titre`) | ampoule → *Ajouter un espace* : `### Titre` |
| Puces affichées en texte | liste collée au paragraphe, sans ligne vide avant | ajouter une ligne vide avant la liste |

## Et ensuite ?

- Couper ou réactiver le rendu DSFR : clic sur **DSFR** dans la barre d'état.
- Les réglages (thème, vérification des liens, conseils…) : **Ctrl+,** → chercher `dsfrPreview`.
- Un rendu différent du site, une idée ? Ouvrir une [issue](https://github.com/bastienR17/DSFR-VScode/issues/new/choose)
  ou prévenir l'équipe DSNUMRH4.
