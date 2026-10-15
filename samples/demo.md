---
notice:
  type: info
  description: "Page de démonstration : tous les composants du thème MkDocs DSFR"
  link_label: Documentation du thème
  link_url: https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/
breadcrumb:
  - Accueil: /
  - Guides: /guides/
  - Démonstration des composants
summary: true
---

# Démonstration des composants

Cette page sert à vérifier le rendu de l'aperçu DSFR. Ouvrez-la puis lancez l'aperçu (**Ctrl+K V**).

## Alertes et mises en avant

/// alert | Prérequis
    type: warning
Vérifiez que le dossier est **complet** avant de commencer.
///

/// alert | Enregistrement réussi
    type: success
La demande apparaît dans le tableau de bord.
///

/// alert
    type: info
Une petite alerte, sans titre.
///

/// callout | Besoin d'aide ?
    icon: question-line
    link_label: Contacter le support
    link_url: https://exemple.gouv.fr
Le support répond du lundi au vendredi.
///

> Une citation Markdown devient une mise en exergue.
> Les retours à la ligne sont conservés.

## Contenus repliables

/// accordion | Étape 1 : préparer les pièces
- Pièce d'identité
- Justificatif de domicile
///

/// accordion | Étape 2 : déposer le dossier
    open: true
Le dossier est déposé en ligne, puis **validé** sous 48 heures.
///

### Onglets

/// tabs
/// tab | Cas général
    icon: user-line
Procédure standard décrite ci-dessus.
///
/// tab | Cas particulier
Contactez votre gestionnaire.
///
///

## Tableaux et badges

| Champ | Valeur attendue | Obligatoire |
|---|---|---|
| Motif | Texte libre | Oui |
| Durée | 31 jours maximum | Non |
[Champs du formulaire]

/// badge
    type: new
Nouveau
///

/// badge
    color: purple-glycine
Badge coloré
///

## Cartes, tuiles et boutons

/// row | fr-grid-row--gutters
/// col | 12 md-6
/// card | Guide de l'utilisateur
    description: Toutes les procédures, pas à pas
    badge: Mis à jour | green-menthe
    target: guide.md
Fiche pratique
///
///
/// col | 12 md-6
/// tile | Glossaire
    picto: document/document
    description: Les sigles et abréviations
    target: glossaire.md
///
///
///

/// buttons
    inline: inline
    attrs: {class: fr-btns-group--icon-right}
/// button | Commencer
    icon: arrow-right-line
    icon_place: right
///
/// button | En savoir plus
    kind: secondary
///
///

## Citation et définitions

/// quote | Une utilisatrice
    size: lg
« L'aperçu me montre exactement ce que le site affichera. »
///

Aperçu
:   Vue du rendu final, à côté du fichier Markdown.

![Illustration de démonstration](illustration.svg){: .fr-responsive-img }
