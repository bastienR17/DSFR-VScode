---
title: Guide: erreurs courantes
---

# Erreurs signalées par l'aperçu

L'en-tête ci-dessus contient lui aussi une erreur : la valeur de `title` contient « : ».

Chaque bloc ci-dessous contient une erreur fréquente. Sur le site, il s'afficherait mal
ou en texte brut ; l'aperçu le signale dans un encadré.

## Valeur inconnue

/// alert | Type inexistant
    type: rouge
Ce bloc s'affichera en texte brut sur le site.
///

## Option inconnue

/// accordion | Accordéon
    ouvert: true
L'option s'appelle « open ».
///

## Titre manquant

/// accordion
Un accordéon doit avoir un titre après « | ».
///

## Pictogramme introuvable

/// tile | Tuile
    picto: inconnu/introuvable
///

## Bouton à icône dans un groupe

/// buttons
/// button | Télécharger
    icon: download-line
///
///

## Liste mal indentée

- Première puce

  Ce texte n'est indenté que de 2 espaces : sur le site, il sortira de la liste.
- Deuxième puce

### Cas voisin, reproduit sans encadré

Certains écarts ne sont pas signalés : l'aperçu affiche simplement ce que le site affichera.
Ici, le paragraphe est directement suivi d'une liste :
- sur le site comme dans l'aperçu, ces lignes restent du texte ;
- il faut une ligne vide avant la liste.

## Bloc non fermé

/// alert | Fermeture oubliée
Il manque « /// » à la fin de ce bloc.

