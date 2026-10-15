"""Exemples « Extrait de code » de la documentation officielle mkdocs-dsfr
(https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/), relevés en octobre 2026."""
EXAMPLES = {
"accordeon simple": """/// accordion | Intitulé 1
Contenu de mon Accordéon

- Point 1
- Point 2
///
""",
"accordeon ouvert": """/// accordion | Intitulé 2
    open: true
##### Titre

> Bloc de citation
///
""",
"accordeon markup": """/// accordion | Intitulé 3
    markup: h3
Cet accordéon utilise un `<h3>` comme titre pour respecter la hiérarchie de la page.
///
""",
"alerte simple": """/// alert | Information
C'est une Information **importante**.
///
""",
"alertes types": """/// alert | alerte de succes
    type: success

C'est une Information **par défaut**.
///

/// alert | alerte d'erreur
    type: error

C'est une Information **d'erreur**.
///

/// alert | alerte d'info
    type: info

C'est une **Information**.
///

/// alert | alerte d'avertisssement
    type: warning

C'est une Information **d'avertissement**.
///
""",
"alerte puces": """/// alert | Avec puces
    type: success
* Toujours privilégier l’héritage des permissions.
* Regrouper les documents nécessitant des droits spécifiques dans des bibliothèques distinctes.
* Éviter de modifier les permissions directement sur des fichiers individuels.
///
""",
"badge simple": """/// badge
Actualité
///

- Dernière nouveauté
""",
"badges": """/// badge
    type: success

Validé
///
/// badge
    type: error
    icon: false
Périmé
///
/// badge
    color: green-menthe
Spécial
///

etc.
""",
"bouton simple": """/// button | En savoir plus
    target: https://www.systeme-de-design.gouv.fr/
///
""",
"groupe vertical": """/// buttons

/// button | Bouton primaire
    target: "#"
///

/// button | Bouton secondaire
    target: "#"
    kind: secondary
///

/// button | Bouton tertiaire
    target: "#"
    kind: tertiary
///

///
""",
"boutons variantes": """/// button | Primaire
    target: "#"
///

/// button | Secondaire
    target: "#"
    kind: secondary
///

/// button | Tertiaire
    target: "#"
    kind: tertiary
///

/// button | Tertiaire sans contour
    target: "#"
    kind: tertiary-no-outline
///
""",
"boutons tailles": """/// button | Petit
    target: "#"
    size: sm
///

/// button | Moyen (défaut)
    target: "#"
///

/// button | Grand
    target: "#"
    size: lg
///
""",
"boutons icones": """/// button | Télécharger
    target: "#"
    icon: download-line
    icon_place: left
///

/// button | Suivant
    target: "#"
    icon: arrow-right-line
    icon_place: right
///

/// button | Rechercher
    target: "#"
    icon: search-line
    icon_place: icon-only
///
""",
"bouton externe": """/// button | Documentation DSFR
    target: https://www.systeme-de-design.gouv.fr/
    target_new: true
///
""",
"groupe en ligne aligne": """/// buttons
    inline: inline
    align: center

/// button | Gauche
    target: "#"
    kind: secondary
///

/// button | Centre
    target: "#"
    kind: secondary
///

///
""",
"groupe equisized": """/// buttons
    inline: inline
    equisized: true

/// button | Action 1
    target: "#"
///

/// button | Action 2
    target: "#"
    kind: secondary
///

///
""",
"groupe taille": """/// buttons
    size: sm
    inline: inline

/// button | Petit 1
    target: "#"
///

/// button | Petit 2
    target: "#"
    kind: secondary
///

///
""",
"mise en avant simple": """/// callout | Information importante
C'est une mise en avant **importante**.
///
""",
"mise en avant icone": """/// callout | Information importante
    icon: info-line
C'est une mise en avant **importante**.
///
""",
"mise en avant bouton": """/// callout | Information importante
    link_label: En savoir plus
    link_url: https://www.example.com/
    link_newtab: true
C'est une mise en avant **importante**.
///
""",
"mise en avant perso": """/// callout | Information importante
    markup: h5
    color: green-menthe
    icon: medal-fill
    link_label: En savoir plus
    link_url: https://www.example.com/
    link_newtab: true
C'est une mise en avant **importante**.
///
""",
"cartes deux colonnes": """/// row
/// col
/// card | Exemple de carte
    image: ../assets/placeholder.16x9.png
    target: https://www.example.com/
Une description succincte
///
///
/// col
/// card | Exemple de carte 2
    image: ../assets/placeholder.16x9.png
    target: https://www.example.com/
Une autre description succincte
///
///
///
""",
"cartes options": """/// row | fr-grid-row--gutters
/// col
/// card | Avec Description
    description: Description / sous-titre
    image: ../assets/placeholder.16x9.png
    target: https://www.example.com/
Une description succincte
///
///
/// col
/// card | Juste le titre cliquable
    image: ../assets/placeholder.16x9.png
    target: https://www.example.com/
    enlarge: false
Une autre description succincte
///
///
/// col
/// card | Avec badge
    image: ../assets/placeholder.16x9.png
    target: https://www.example.com/
    badge: Défaut, Favori | green-menthe
Une autre description succincte
///
///
///
/// row | fr-grid-row--gutters
/// col
/// card | Mode download avec infos PJ
    image: ../assets/placeholder.16x9.png
    target: /assets/placeholder.16x9.png
    download: true
    assess: true
///
///
/// col
/// card | Sans image
    target: https://www.example.com/
    horizontal: true
    horizontal_pos: half
Une autre description succincte
///
///
///

etc.
""",
"grille texte": """/// row
/// col
Lorem ipsum dolor sit amet.
///
/// col
Sed ut perspiciatis unde omnis.
///
///
""",
"grille largeurs": """/// row | fr-grid-row--gutters
    valign: bottom
/// col | 12 lg-8
Lorem ipsum dolor sit amet.
///
/// col | 12 lg-4
/// tile | Tuile succès
    target: https://www.example.com/
Une autre description succincte
///
///
///
""",
"media video": """/// media | L'outro du MATTE
    url: ../../assets/MIN_SG_16-9_1.mp4
    captions: ../../assets/MIN_SG_16-9_1.vtt
    poster: ../../assets/MIN_SG_16-9_1.png
///
""",
"media externe": """/// media | Présentation du Système de Design de l'État
    type: video_external
    url: https://www.youtube.com/embed/HyirpmPL43I
    ratio: 16x9
///
""",
"media audio": """/// media | Extrait audio de démonstration
    type: audio
    url: ../../assets/example-audio.mp3
///
""",
"media image": """/// media | Photographie du ministère — Source : MTECT
    type: image
    url: ../../assets/placeholder.16x9.png
    title: Vue du bâtiment du ministère
///
""",
"media lien": """/// media | L'outro du MATTE
    url: ../../assets/MIN_SG_16-9_1.mp4
    poster: ../../assets/MIN_SG_16-9_1.png
    link: https://www.ecologie.gouv.fr
    link_label: En savoir plus sur le ministère
///
""",
"media ratio": """/// media | Image au format 4x3
    type: image
    url: ../../assets/placeholder.16x9.png
    ratio: 4x3
///
""",
"citation": """/// quote | Victor Hugo
    image: https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Victor_Hugo_001.jpg/330px-Victor_Hugo_001.jpg
    size: lg
    color: green-menthe
« Notre devise est : Liberté, Egalité, Fraternité ! Victor Hugo décrivait notre devise comme étant les trois marches
du perron suprême et que le mot le plus fort était celui de Fraternité »
///
""",
"onglets simples": """/// tabs

/// tab | Onglet 1
Contenu du **premier** onglet.

- Point 1
- Point 2
///

/// tab | Onglet 2
Contenu du *deuxième* onglet.
///

/// tab | Onglet 3
Contenu du troisième onglet.
///

///
""",
"onglets label": """/// tabs
    label: Navigation par catégorie

/// tab | Actualités
Les dernières actualités du projet.
///

/// tab | Documentation
Accédez à la documentation technique.
///

///
""",
"onglets icones": """/// tabs

/// tab | Accueil
    icon: home-4-line
Contenu de l'onglet Accueil.
///

/// tab | Paramètres
    icon: settings-5-line
Contenu de l'onglet Paramètres.
///

///
""",
"onglet selectionne": """/// tabs

/// tab | Premier
Contenu du premier onglet.
///

/// tab | Deuxième
    selected: true
Cet onglet est sélectionné par défaut.
///

/// tab | Troisième
Contenu du troisième onglet.
///

///
""",
"onglets pleine largeur": """/// tabs
    viewport_width: true

/// tab | Onglet large 1
Ce système d'onglets prend toute la largeur de la fenêtre.
///

///
""",
"tuiles": """/// row | fr-grid-row--gutters
/// col
/// tile | Avec Description
    description: Description / sous-titre
    target: https://www.example.com/
Une description succincte
///
///
/// col
/// tile | Juste le titre cliquable
    target: https://www.example.com/
    enlarge: false
Une autre description succincte
///
///
/// col
/// tile | Avec badge
    target: https://www.example.com/
    badge: Favori | green-menthe
Une autre description succincte
///
///
///
/// row | fr-grid-row--gutters
/// col
/// tile | Mode download avec infos PJ
    target: /assets/placeholder.16x9.png
    download: true
    assess: true
///
///
/// col
/// tile | Mode horizontal 50%
    target: https://www.example.com/
    horizontal: true
Une autre description succincte
///
///
///

etc.
""",
"exergue": "> Ceci est un bloc de citation.\n",
"tableau legende": """| Nom | Prénom | Rôle |
| --- | ------ | ---- |
| Dupont | Jean | Développeur |
| Martin | Claire | Designer |
[Équipe projet]
""",
"composition": """/// row | fr-background-contrast--blue-ecume fr-grid-row--middle
/// col | 12 xl-8
    class: fr-p-6w fr-px-md-8w

### Un super slogan pour votre site

Quelques détails qui feront la différence grâce à cette composition visuelle.

/// buttons
    inline: inline-sm

/// button | Action principale
    target: "#"
///
/// button | Autre action
    kind: secondary
    target: "#"
///
///

///
/// col | 12 xl-4
    class: fr-hidden fr-unhidden-xl

![](/assets/composition_exemple.webp){: .fr-responsive-img .fr-responsive-img--1x1 }

///
///
""",
}
