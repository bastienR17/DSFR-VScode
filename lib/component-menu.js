'use strict';
/**
 * Commande « Insérer un composant » : la liste des snippets (snippets/dsfr.json), rangée par familles
 * avec une icône et une phrase d'explication, pour insérer un composant sans rien retenir.
 *
 * Les composants de l'en-tête de page (bandeau, fil d'Ariane, sommaire…) sont placés au bon endroit :
 * dans l'en-tête « --- » s'il existe, sinon dans un nouvel en-tête créé en haut du fichier.
 *
 * Module pur, testé par test/component-menu.js.
 */

// Familles, dans l'ordre d'affichage. `match` reçoit le raccourci principal (« dsfr-alerte »…).
const FAMILIES = [
  { id: 'sirh', label: 'Doc SIRH — les blocs de l\'équipe', icon: 'book', match: (p) => p.startsWith('dsfr-sirh-') },
  { id: 'messages', label: 'Messages et encadrés', icon: 'megaphone', match: (p) => /^dsfr-(alerte|mise-en-avant|citation|exergue)/.test(p) },
  { id: 'cards', label: 'Cartes, tuiles et grilles', icon: 'layout', match: (p) => /^dsfr-(carte|tuile|grille)/.test(p) },
  { id: 'fold', label: 'Contenus repliables', icon: 'fold', match: (p) => /^dsfr-(accordeon|onglets)/.test(p) },
  { id: 'links', label: 'Boutons, tags et badges', icon: 'link', match: (p) => /^dsfr-(bouton|tag|badge)/.test(p) },
  { id: 'media', label: 'Images, vidéos et tableaux', icon: 'file-media', match: (p) => /^dsfr-(img|image|video|tableau)/.test(p) },
  { id: 'header', label: 'En-tête de la page (bandeau, fil d\'Ariane, sommaire)', icon: 'symbol-key', match: (p) => /^dsfr-(entete|bandeau|fil-ariane|sommaire|lettre-info)/.test(p) },
];

const ICONS = {
  'dsfr-alerte': 'warning', 'dsfr-alerte-simple': 'info', 'dsfr-mise-en-avant': 'star-empty', 'dsfr-citation': 'quote', 'dsfr-exergue': 'quote',
  'dsfr-accordeon': 'chevron-down', 'dsfr-onglets': 'folder-library', 'dsfr-tableau': 'table', 'dsfr-img': 'file-media',
  'dsfr-image': 'file-media', 'dsfr-video': 'device-camera-video', 'dsfr-bouton': 'link-external', 'dsfr-boutons': 'link-external',
  'dsfr-tag': 'tag', 'dsfr-tags': 'tag', 'dsfr-badge': 'circle-filled', 'dsfr-badge-couleur': 'circle-filled',
  'dsfr-sirh-capture': 'device-camera', 'dsfr-sirh-version': 'history', 'dsfr-sirh-suivi': 'history', 'dsfr-sirh-consigne': 'info',
  'dsfr-sirh-chemin': 'arrow-right', 'dsfr-sirh-modop': 'file', 'dsfr-sirh-rubrique': 'files', 'dsfr-sirh-docs-ref': 'references',
};

// Nom affiché : « Alerte DSFR » → « Alerte » ; « Doc SIRH : capture d'écran » → « Capture d'écran »
const cleanName = (name, family) => {
  let n = String(name).replace(/\s+DSFR\b/g, '').replace(/\s*\(en-tête\)\s*$/, '').trim();
  if (family === 'sirh') n = n.replace(/^Doc SIRH\s*:\s*/, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};
// Explication : « Doc SIRH — capture d'écran… » → « Capture d'écran… »
const cleanDetail = (d) => {
  const t = String(d || '').replace(/^Doc SIRH\s*—\s*/, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * @param {object} snippets  contenu de snippets/dsfr.json
 * @returns {Array<{separator: true, label: string} | {label: string, icon: string, prefix: string, description: string,
 *          detail: string, body: string, family: string}>}  séparateurs et composants, dans l'ordre d'affichage
 */
function buildMenu(snippets) {
  const byFamily = new Map(FAMILIES.map((f) => [f.id, []]));
  const other = [];
  for (const [name, s] of Object.entries(snippets)) {
    const prefix = [].concat(s.prefix)[0];
    const family = FAMILIES.find((f) => f.match(prefix));
    const item = {
      label: cleanName(name, family && family.id),
      icon: ICONS[prefix] || (family ? family.icon : 'symbol-snippet'),
      prefix,
      description: prefix,
      detail: cleanDetail(s.description),
      body: [].concat(s.body).join('\n'),
      family: family ? family.id : 'other',
    };
    (family ? byFamily.get(family.id) : other).push(item);
  }
  const out = [];
  for (const f of FAMILIES) {
    const items = byFamily.get(f.id);
    if (!items.length) continue;
    out.push({ separator: true, label: f.label });
    out.push(...items);
  }
  if (other.length) out.push({ separator: true, label: 'Autres' }, ...other);
  return out;
}

/**
 * Où insérer un composant de l'en-tête de page, et quoi insérer.
 * @param {string[]} lines  lignes du document
 * @param {{prefix: string, body: string}} item
 * @returns {{line: number, character: number, text: string}|{error: string}|null}  null : à la position du curseur
 */
function headerPlacement(lines, item) {
  if (!/^dsfr-(entete|bandeau|fil-ariane|sommaire|lettre-info)$/.test(item.prefix)) return null;
  let end = -1;
  if (/^---\s*$/.test(lines[0] || '')) end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
  if (item.prefix === 'dsfr-entete') {
    if (end > 0) return { error: 'Cette page a déjà un en-tête (entre les deux lignes « --- » tout en haut). Ajoutez-y plutôt un bandeau, un fil d\'Ariane ou un sommaire.' };
    return { line: 0, character: 0, text: item.body.replace(/\n?$/, '\n') + '\n' };
  }
  const keys = item.body.replace(/\n?\$0\s*$/, '') + '\n'; // clés de l'en-tête, sans la ligne vide du curseur final
  if (end > 0) return { line: end, character: 0, text: keys };
  return { line: 0, character: 0, text: '---\n' + keys + '---\n\n$0' };
}

module.exports = { buildMenu, headerPlacement, FAMILIES };
