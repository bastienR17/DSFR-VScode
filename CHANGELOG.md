# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## 0.11.0 — octobre 2026

Version pensée pour les rédacteurs qui n'ont pas l'habitude de VS Code.

### Ajouts
- **Pas-à-pas « Bien démarrer »** : 5 étapes illustrées (ouvrir une page, voir l'aperçu, insérer un composant,
  corriger une erreur, régler l'affichage), avec un bouton par étape. Il s'ouvre à la première installation ;
  pour le rouvrir : **DSFR : Bien démarrer**. Commande **DSFR : Créer une page d'essai** : une page non
  enregistrée, avec une erreur volontaire à corriger, pour tout essayer sans risque.
- **＋ Insérer un composant** (bas de l'écran, clic droit ou palette) : les composants rangés par familles
  (Doc SIRH, messages, cartes et tuiles, contenus repliables, boutons, images et tableaux, en-tête de page),
  avec une icône et une phrase d'explication. Les blocs de l'en-tête de page se placent tout seuls en haut.
- **Couleurs DSFR dans l'éditeur**, quel que soit le thème : `///` en rouge Marianne, nom du bloc en bleu France,
  titre en vert, options en violet, léger fond bleu sur les lignes d'ouverture et de fermeture (réglage `dsfrPreview.colors`).
- **L'aperçu s'ouvre tout seul** à la première page Markdown ouverte (réglage `dsfrPreview.autoOpen`).
- Les longues lignes passent à la ligne dans les fichiers Markdown.

### Modifications
- **Messages en français simple** : ce qui ne va pas, puis quoi faire (« il manque la ligne `///` qui marque sa
  fin… l'ampoule 💡 peut le faire »), sans jargon technique. Encadrés de l'aperçu : « À corriger »,
  « Composant mal écrit », « Différent sur le site ».
- **Bas de l'écran en couleur** : « ✓ Page sans erreur » en vert, « N points à vérifier » sur fond orange,
  « N points à corriger » sur fond rouge ; un clic les liste avec leur ligne.

## 0.10.1 — octobre 2026

### Corrections
- **Titre sans espace après les `#`** (`###Rechercher l'acte à modifier`) : le site l'affiche comme un titre,
  l'aperçu le laissait en texte. L'aperçu fait maintenant comme le site, et l'éditeur le signale avec une
  correction en un clic (`### Rechercher…`) : sans l'espace, il reste en texte dans le wiki GitLab.

## 0.10.0 — octobre 2026

### Ajouts
- **L'aperçu montre la page comme sur le site** : en-tête (bloc-marque, titre et sous-titre du site),
  bandeau, **menu latéral** avec le sommaire de la page (cliquable), colonne de contenu et pied de page,
  d'après les gabarits du thème mkdocs-dsfr 0.27. Les textes de l'en-tête, du menu et du pied de page sont lus
  dans le `mkdocs.yml` du site ; sans lui, ce sont ceux de **Doc SIRH** (bloc-marque des ministères, titre et
  sous-titre, liens de l'en-tête, barre de recherche, rubriques du menu avec celle de la page mise en évidence,
  pied de page). Bloc-marque, titre et sous-titre se changent dans `dsfrPreview.siteBrand`, `siteTitle`, `siteTagline`.
  Le réglage `dsfrPreview.pageLayout` = `content` revient à l'affichage du contenu seul.
- Réglage `dsfrPreview.desktopWidth` : la page s'affiche à la largeur d'un ordinateur (1280 px), réduite pour
  tenir dans l'aperçu ; les cartes, tuiles et colonnes passent à la ligne comme sur le site.
- **Couleurs dans l'éditeur** : les en-têtes `/// nom | titre`, les options (clé et valeur) et les fermetures
  `///` sont colorés selon le thème de VS Code. Rien n'est coloré dans les blocs de code.
- **Repli des blocs** : une flèche dans la marge replie un bloc `///` (onglets, accordéon, grille…) jusqu'à sa fermeture.

### Modifications
- Ligne de cartes non fermée avant la suivante : le `///` ajouté par l'ampoule se place juste après la dernière
  fermeture du bloc, avant la ligne vide (cas réel de la page Estève).

## 0.9.9 — octobre 2026

L'aperçu suit maintenant les dernières versions du thème, celles qu'utilise le site Doc SIRH
(mis à jour automatiquement) : **mkdocs-dsfr 0.27.0, `dsfr_structure` 0.13.0, DSFR 1.15.4**.

### Ajouts
- **Tags** : nouveaux blocs `/// tag | Libellé` (étiquette, ou lien avec `target`) et `/// tags` (groupe de
  tags côte à côte), avec leurs options (`size`, `icon`, `color`, `target`, `target_new`), l'autocomplétion,
  l'aide au survol et les snippets `dsfr-tag` et `dsfr-tags`. Rendu identique au site sur tous les tests
  officiels de `dsfr_structure`.
- Comme le thème 0.27 : un lien vers une ancre (`#titre`) placée dans un accordéon fermé ouvre l'accordéon.

### Modifications
- Styles, polices Marianne et icônes du DSFR 1.15.4 (au lieu de 1.15.2).
- Bouton ou tag avec du texte sous l'en-tête : le titre et le texte sont séparés par une espace, comme sur le site.

## 0.9.8 — octobre 2026

Version issue de la comparaison de 11 vraies pages Doc SIRH (modes opératoires et pages de rubrique)
avec le moteur du site : 10 étaient déjà identiques, la 11e l'est désormais.

### Corrections
- **Sous-liste indentée de 2 espaces** : le site ne l'imbrique pas (Python-Markdown exige 4 espaces), ses
  puces rejoignent la liste principale. L'aperçu l'imbriquait : il l'affiche maintenant comme le site.
  L'avertissement reste, avec une correction dans l'ampoule qui indente la sous-liste de 4 espaces.

### Ajouts
- **Ligne de grille non fermée** : quand un `/// row` (ou une carte, une colonne…) n'est pas fermé avant le
  bloc suivant du même nom, le message donne la ligne exacte où ajouter `///`, et l'ampoule l'ajoute au bon
  endroit (avant : « fermer à la fin de la page », qui ne corrigeait pas une page de rubrique en plusieurs lignes).
- Nouveaux avertissements, chacun avec sa correction, pour des défauts relevés sur ces pages :
  - lien mal formé : `[texte(https://…)` (il manque `]`) ou adresse sans `)` final ;
  - astérisques échappés `\*\*texte\*\*` (affichés au lieu du gras) ;
  - titre coupé en deux : la fin du titre, en minuscule, passée seule à la ligne suivante.

## 0.9.7 — octobre 2026

### Ajouts
- **Conseils d'accessibilité et de liens**, soulignés discrètement (pointillés bleus, niveau « information »,
  non comptés dans la barre d'état) :
  - image sans description : `![](…)` aux crochets vides ou `<img>` sans `alt` (lue par les lecteurs
    d'écran, exigée par le RGAA). L'ampoule ajoute `alt=""` à compléter ;
  - lien absolu vers une page du site (`https://docsirh.e2.rie.gouv.fr/Rubrique/Page/`) : un lien relatif
    vers le `.md` reste valable si l'adresse change et MkDocs le vérifie. L'ampoule propose le lien
    relatif quand la page est trouvée dans le dossier. Les liens vers `…/fichiers/` ne sont pas concernés.
  - Réglages `dsfrPreview.checkImageAlt` et `dsfrPreview.siteUrl` (le `site_url` du `mkdocs.yml` est prioritaire).
- Snippets `dsfr-carte-2` et `dsfr-carte-3` : 2 ou 3 cartes côte à côte, comme les tuiles.
- **Guide de prise en main** pour les rédacteurs : [docs/prise-en-main.md](docs/prise-en-main.md).
- **Veille automatique** : chaque lundi, la CI relance les tests avec les dernières versions de
  Python-Markdown et signale une nouvelle version de mkdocs-dsfr, de `dsfr_structure` ou du DSFR.

### Modifications
- La liste **DSFR : Problèmes de la page** distingue les problèmes des conseils (icône ⓘ).

## 0.9.6 — octobre 2026

### Ajouts
- **13 snippets Doc SIRH** (`dsfr-sirh-…`), écrits à partir de vrais modes opératoires et pages de rubrique de
  l'équipe DSNUMRH4 : page de MODOP complète, page de rubrique en cartes, fil d'Ariane HTML, suivi des
  modifications (la nouvelle version est datée du jour automatiquement), documents de référence, chemin
  `⮡ Domaine › Thème › Action fonctionnelle`, capture d'écran, consigne, cartes. Taper `dsfr-sirh`
  n'affiche qu'eux.

### Corrections
- « Gras mal fermé » : faux signalement sur `**G**estion de l'**A**rchivage` (les `**` sont maintenant
  appariés dans l'ordre, comme le fait Python-Markdown). Le code en ligne est ignoré.

## 0.9.5 — octobre 2026

### Modifications
- **Snippets sans Ctrl+Espace** : taper `dsfr-` ouvre directement la liste des composants. Ctrl+Espace
  n'est plus nécessaire (sur Mac, ce raccourci change la langue du clavier et n'arrivait pas à VS Code ;
  sur certains PC, il est pris par un autre logiciel). La liste ne s'ouvre que sur `dsfr-`, jamais
  pendant l'écriture du texte.

### Ajouts
- Snippets `dsfr-tuile-2` et `dsfr-tuile-3` : 2 ou 3 tuiles côte à côte dans une grille (l'une sous
  l'autre sur mobile). Taper `dsfr-tuile` propose les trois : une tuile seule, 2 ou 3 tuiles.

## 0.9.4 — octobre 2026

### Corrections
- Intégration continue : le test de parité échouait depuis la sortie de Python-Markdown 3.11.1, qui
  n'affiche plus en gras `**limites **à` (espace avant les `**` fermantes), alors que les versions
  précédentes le faisaient.
- Ce cas n'est donc plus rendu en gras dans l'aperçu (comme les versions récentes du site) : il est
  signalé (« Gras mal fermé »), avec une correction proposée dans l'ampoule, `**limites** à`, dont le
  rendu est le même quelle que soit la version.

## 0.9.3 — octobre 2026

### Modifications
- Snippet `dsfr-img` : insère seulement `![](https://docsirh.e2.rie.gouv.fr/fichiers/)`, sans dossier ni nom de
  fichier d'exemple. Le curseur se place après `fichiers/` pour compléter le chemin ; **Tab** passe ensuite à la
  description de l'image entre crochets.

## 0.9.2 — octobre 2026

Localiser les problèmes, sans jamais modifier la page à la place de l'auteur.

### Ajouts
- **Commande « DSFR : Problèmes de la page »** (clic droit dans le Markdown, ou palette) : liste les
  problèmes de la page avec leur ligne ; en choisir un place le curseur dessus.
- **Compteur dans la barre d'état** (« ⚠ 3 DSFR ») quand la page a des problèmes ; un clic les liste.
- **« ``` » fautif désigné** : quand un bloc n'est pas fermé à cause d'un « ``` » en trop ou non refermé,
  le message donne la ligne de ce « ``` » (ex. « le « ``` » de la ligne 505 semble en trop »), et
  cette ligne est soulignée dans l'éditeur.
- **Nom de bloc inconnu** (`/// alrt`) : signalé, avec le nom le plus proche (`alert`).
- **« /// » en trop**, qui ne ferme aucun bloc : signalé (sauf la fermeture d'un bloc déjà signalé).
- **Snippet `dsfr-img`** : image hébergée sur Doc SIRH,
  `![Description de l'image](https://docsirh.e2.rie.gouv.fr/fichiers/Dossier/image.png)` ; **Tab** passe
  de la description au dossier puis au nom du fichier.

### Retraits
- Commande « DSFR : Corriger la page » et correction à l'enregistrement (`source.fixAll.dsfr`) :
  l'extension ne modifie plus la page d'elle-même. Les corrections de l'ampoule restent proposées,
  une par une, et ne s'appliquent que sur un clic.

## 0.9.1 — octobre 2026

Corriger plus vite, et savoir où chercher. Constaté sur une vraie page Doc SIRH.

### Ajouts
- **Commande « DSFR : Corriger la page »** (clic droit dans le Markdown, ou palette) : applique d'un coup les
  corrections sûres, en une modification annulable par Ctrl+Z, et liste le reste avec ses lignes (message,
  bouton « Aller au premier », journal DSFR dans le panneau Sortie). Aussi disponible à l'enregistrement
  (`editor.codeActionsOnSave` → `source.fixAll.dsfr`, désactivé par défaut) et en dernier choix de l'ampoule.
  Synonymes français reconnus (`ouvert` → `open`, `erreur` → `error`…).
- **Encadrés d'erreur de l'aperçu** : ligne du fichier dans le titre (« Attention · ligne 99 »), double-clic
  pour y placer l'éditeur ; une option fautive est indiquée à sa propre ligne ; un bloc non fermé est
  signalé là où il commence, et non plus en bas de page.
- **Bloc non fermé à cause d'un « ``` »** : quand un bloc de code est ouvert sans être refermé
  (ou qu'un « ``` » est en trop), tout ce qui suit est lu comme du code et les « /// » de fermeture
  disparaissent. Le message indique maintenant entre quelles lignes chercher ce « ``` », au lieu de
  proposer une fermeture qui ne réglerait rien. Pour un conteneur (onglets, grille…), la fermeture
  est proposée en fin de page plutôt qu'au milieu de son contenu.

### Corrections
- Gras dont le texte finit par une espace (`des **limites **à garder`) : affiché en gras comme sur le
  site, au lieu des « ** » bruts de VS Code.

## 0.9.0 — octobre 2026

Écrire juste du premier coup : les problèmes sont signalés dans le Markdown, page par page.

### Ajouts
- **Problèmes soulignés dans l'éditeur** : tout ce que l'aperçu signale (option inconnue, valeur invalide,
  titre manquant ou en trop, bloc non fermé, pictogramme introuvable, `/// notice` déprécié, bouton à icône
  réduit dans un groupe, liste mal indentée, bandeau et fil d'Ariane de l'en-tête) apparaît aussi dans le
  panneau **Problèmes**, à la ligne et à la colonne exactes. Seule la page ouverte est analysée.
- **Corrections rapides** (ampoule) : valeur la plus proche (`warnig` → `warning`, `oui` → `true`),
  option renommée ou retirée, titre ajouté ou retiré, bloc fermé, classe `fr-btns-group--icon-*` ajoutée
  au groupe de boutons, type de bandeau corrigé.
- **Autocomplétion** des noms de blocs après `///`, des options d'un bloc et de leurs valeurs
  (listes, booléens, 102 pictogrammes et icônes du DSFR), et du type de bandeau dans l'en-tête.
- **Aide au survol** des blocs et des options : description, valeurs possibles, valeur par défaut,
  lien vers la page du composant dans la documentation du thème.
- **Liens, images et ancres introuvables** soulignés (liens `.md`, images, fichiers, adresses des options
  `image`, `target`…). Nouveau réglage `dsfrPreview.checkLinks`.
- **Lecture facultative du `mkdocs.yml`** : liens absolus résolus depuis `docs_dir`, et signalement des
  syntaxes utilisées mais non activées dans `markdown_extensions` (`///`, `!!!`, `???`, `attr_list`, `def_list`).
- **L'aperçu suit la page ouverte** et chaque page retrouve ses accordéons et onglets ouverts
  quand on y revient. Une option `open: true` modifiée dans le Markdown est de nouveau suivie.
- Modèles d'issues GitHub : « Rendu différent du site » et « Idée ou amélioration ».

### Corrections
- `/// notice` : une icône contenant des guillemets cassait le HTML de l'aperçu (valeur maintenant échappée).
- `attr_list` : les noms d'attributs invalides et les gestionnaires d'événements (`onclick`…) sont ignorés dans l'aperçu.

### Divers
- Auteur indiqué dans la licence, le `package.json` et le README : Bastien (bastienR17).
- markdown-it 14 inclus dans l'extension (`lib/vendor/`) pour analyser la page côté éditeur.

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
