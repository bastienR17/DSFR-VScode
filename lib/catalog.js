'use strict';
/**
 * Descriptions des composants et de leurs options, en français, pour l'autocomplétion et
 * l'aide au survol. Les options elles-mêmes (noms, valeurs par défaut, valeurs possibles)
 * viennent de options.js : ce module n'ajoute que les textes et les liens vers la
 * documentation officielle du thème.
 */
const fs = require('fs');
const path = require('path');
const { BLOCKS, NOTICE_TYPES, optionValues } = require('./options');

const DOC_BASE = 'https://pub.gitlab-pages.din.developpement-durable.gouv.fr/numeco/mkdocs-dsfr-doc/composants/';

// Libellé, résumé et page de documentation de chaque bloc.
const BLOCK_DOCS = {
  alert: { label: 'Alerte', page: 'alert', summary: 'Message important (succès, erreur, information, avertissement). Sans titre, l\'alerte est réduite.' },
  accordion: { label: 'Accordéon', page: 'accordion', summary: 'Contenu replié sous un titre cliquable.' },
  badge: { label: 'Badge', page: 'badge', summary: 'Étiquette courte de statut ou de catégorie.' },
  callout: { label: 'Mise en avant', page: 'callout', summary: 'Encadré coloré pour mettre un texte en avant, avec un bouton facultatif.' },
  card: { label: 'Carte', page: 'card', summary: 'Carte cliquable vers une page, avec description, image, badges ou tags.' },
  tile: { label: 'Tuile', page: 'tile', summary: 'Tuile cliquable avec pictogramme, plus compacte qu\'une carte.' },
  row: { label: 'Ligne de grille', page: 'grid', summary: 'Ligne de la grille DSFR, qui contient des colonnes « /// col ». Le titre facultatif ajoute des classes (ex. fr-grid-row--gutters).' },
  col: { label: 'Colonne de grille', page: 'grid', summary: 'Colonne d\'une ligne « /// row ». Le titre facultatif donne la largeur (ex. 6 ou 12 md-6).' },
  notice: { label: 'Bandeau d\'information (déprécié)', page: 'notice', summary: 'Déprécié : déclarer plutôt « notice: » dans l\'en-tête YAML de la page.' },
  quote: { label: 'Citation', page: 'quote', summary: 'Citation mise en forme. Le titre après « | » est l\'auteur.' },
  media: { label: 'Média', page: 'media', summary: 'Image, vidéo ou son, avec légende.' },
  tabs: { label: 'Système d\'onglets', page: 'tab', summary: 'Conteneur d\'onglets « /// tab | Libellé ».' },
  tab: { label: 'Onglet', page: 'tab', summary: 'Onglet d\'un bloc « /// tabs ». Le titre est le libellé de l\'onglet.' },
  buttons: { label: 'Groupe de boutons', page: 'button', summary: 'Conteneur de boutons « /// button | Libellé ».' },
  button: { label: 'Bouton', page: 'button', summary: 'Bouton ou lien en forme de bouton. Le titre est le libellé.' },
  tags: { label: 'Groupe de tags', page: 'tag', summary: 'Conteneur de tags « /// tag | Libellé », affichés côte à côte.' },
  tag: { label: 'Tag', page: 'tag', summary: 'Étiquette cliquable ou lien vers une page (avec target). Le titre est le libellé.' },
};

// Descriptions des options. Les valeurs possibles et par défaut sont ajoutées automatiquement.
const COMMON = {
  attrs: 'Attributs HTML ajoutés au bloc, ex. {class: ma-classe, id: mon-id}.',
  markup: 'Balise HTML du titre.',
  target: 'Adresse du lien (page du site, URL ou fichier).',
  target_new: 'Ouvrir le lien dans un nouvel onglet.',
  description: 'Texte de description sous le titre.',
  badge: 'Badges, séparés par des virgules ; couleur après « | » (ex. Nouveau | green-emeraude).',
  tag: 'Tags, séparés par des virgules (ignorés si un badge est donné).',
  picto: 'Pictogramme DSFR, ex. buildings/city-hall.',
  enlarge: 'Toute la surface est cliquable.',
  download: 'Lien de téléchargement (affiche le style « téléchargement »).',
  lang: 'Langue du fichier ou de la page cible (attribut hreflang).',
  assess: 'Afficher automatiquement le poids et le format du fichier à télécharger.',
  horizontal: 'Disposition horizontale.',
  variations: 'Variante d\'apparence (grise, sans bordure, sans fond, ombrée).',
  icon: 'Icône DSFR, ex. download-line ou arrow-right-line.',
  color: 'Couleur illustrative DSFR, ex. green-emeraude, blue-ecume.',
  link_label: 'Libellé du lien ou du bouton.',
  link_url: 'Adresse du lien.',
  link_newtab: 'Ouvrir le lien dans un nouvel onglet.',
  size: 'Taille.',
  type: 'Type.',
};
const OPTION_DOCS = {
  alert: { type: 'Type d\'alerte : couleur et icône.' },
  accordion: { open: 'Accordéon ouvert au chargement de la page.' },
  badge: { type: 'Badge de statut (avec icône). L\'emporte sur color.', icon: 'Afficher l\'icône du badge de statut.' },
  callout: { icon: 'Icône DSFR affichée en haut de l\'encadré, ex. info-line.' },
  card: { horizontal_pos: 'Proportion de l\'image en disposition horizontale (tier : un tiers, half : moitié).', image: 'Image de la carte (chemin ou URL).', image_alt: 'Texte alternatif de l\'image.' },
  tile: { small: 'Petite tuile.', vertical_breakpoint: 'Taille d\'écran à partir de laquelle une tuile horizontale devient verticale.' },
  row: { halign: 'Alignement horizontal des colonnes.', valign: 'Alignement vertical des colonnes.' },
  col: { class: 'Classes supplémentaires de la colonne.' },
  notice: { type: 'Type de bandeau.', link_title: 'Info-bulle du lien.' },
  quote: { size: 'Taille du texte de la citation.', image: 'Image illustrant l\'auteur (chemin ou URL).' },
  media: {
    type: 'Nature du média : vidéo du site, vidéo externe (YouTube, Dailymotion…), son ou image.',
    url: 'Adresse du fichier ou de la vidéo.', captions: 'Fichier de sous-titres (.vtt).', title: 'Titre du média lu par les lecteurs d\'écran (par défaut, le titre du bloc).',
    poster: 'Image affichée avant la lecture de la vidéo.', link: 'Lien vers la transcription ou une page associée.',
    link_label: 'Libellé de ce lien.', ratio: 'Proportions du média (largeur x hauteur).',
  },
  tags: { size: 'Petits tags pour tout le groupe.' },
  tag: { size: 'Petit tag.', icon: 'Icône DSFR à gauche du libellé, ex. search-line.', color: 'Couleur illustrative DSFR, ex. green-menthe, blue-ecume (sans effet sur un tag cliquable).' },
  tabs: { label: 'Nom du système d\'onglets lu par les lecteurs d\'écran.', viewport_width: 'Onglets sur toute la largeur de l\'écran.' },
  tab: { selected: 'Onglet affiché au chargement de la page.', icon: 'Icône DSFR devant le libellé.' },
  buttons: {
    size: 'Taille des boutons du groupe.', inline: 'Boutons côte à côte (inline), éventuellement à partir d\'une taille d\'écran.',
    equisized: 'Boutons de même largeur.', align: 'Alignement du groupe.',
  },
  button: {
    kind: 'Style : principal (vide), secondaire, tertiaire, tertiaire sans bordure.', disabled: 'Bouton désactivé.',
    icon_place: 'Place de l\'icône : à gauche, à droite, ou icône seule.',
  },
};

const docUrl = (name) => DOC_BASE + (BLOCK_DOCS[name] ? BLOCK_DOCS[name].page : '') + '/';

const show = (v) => (v === '' ? '(vide)' : String(v));

/** Description d'une option : texte, valeurs possibles, valeur par défaut. */
function optionDoc(name, key) {
  const def = BLOCKS[name] && (BLOCKS[name].options[key] || (key === 'attrs' ? [{}, null] : null));
  if (!def) return null;
  const text = (OPTION_DOCS[name] && OPTION_DOCS[name][key]) || COMMON[key] || '';
  const values = optionValues(name, key);
  const parts = [text];
  if (values) parts.push('Valeurs : ' + values.join(', ') + '.');
  if (key !== 'attrs') parts.push('Par défaut : ' + show(def[0]) + '.');
  return parts.filter(Boolean).join(' ');
}

/** Description d'un bloc, en Markdown : résumé, titre, options, lien vers la documentation. */
function blockDoc(name) {
  const b = BLOCKS[name];
  const d = BLOCK_DOCS[name];
  if (!b || !d) return null;
  const title = b.arg === true ? 'Titre obligatoire : « /// ' + name + ' | Titre ».'
    : (b.arg === false ? 'Pas de titre après « | ».' : 'Titre facultatif après « | ».');
  const options = Object.keys(b.options).concat('attrs').map((k) => '`' + k + '`').join(', ');
  return '**' + d.label + '** — ' + d.summary + '\n\n' + title + '\n\nOptions (indentées de 4 espaces sous l\'en-tête) : ' + options +
    '.\n\n[Documentation du composant](' + docUrl(name) + ')';
}

/* --- Pictogrammes et icônes du DSFR, lus dans les fichiers livrés avec l'extension --- */
let pictos = null;
function pictograms(artworkDir) {
  if (pictos) return pictos;
  pictos = [];
  try {
    for (const dir of fs.readdirSync(artworkDir)) {
      const full = path.join(artworkDir, dir);
      if (!fs.statSync(full).isDirectory()) continue;
      for (const f of fs.readdirSync(full)) if (f.endsWith('.svg')) pictos.push(dir + '/' + f.slice(0, -4));
    }
  } catch (e) { /* dossier absent : pas de suggestions */ }
  pictos.sort();
  return pictos;
}

let icons = null;
function iconNames(cssFiles) {
  if (icons) return icons;
  const set = new Set();
  for (const f of cssFiles) {
    try {
      const css = fs.readFileSync(f, 'utf8');
      const re = /\.fr-icon-([a-z0-9-]+)(?=[\s:,.{[])/g;
      let m;
      while ((m = re.exec(css))) set.add(m[1]);
    } catch (e) { /* feuille absente : ignorée */ }
  }
  icons = Array.from(set).sort();
  return icons;
}

module.exports = { BLOCK_DOCS, DOC_BASE, NOTICE_TYPES, docUrl, optionDoc, blockDoc, pictograms, iconNames };
