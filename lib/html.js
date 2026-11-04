'use strict';
/**
 * Petites fonctions de construction HTML partagées par les modules de rendu.
 */

/** Échappe un texte pour le placer dans du HTML ou dans un attribut entre guillemets. */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Assemble des classes CSS en ignorant les valeurs vides : cls('a', '', 'b c') → 'a b c'. */
function cls(...parts) {
  return parts.join(' ').split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Construit une liste d'attributs HTML (avec l'espace initial).
 *  - les valeurs null, undefined et false sont omises ; true donne un attribut booléen ;
 *  - `extra` correspond à l'option `attrs` des blocs : ses classes s'ajoutent, ses autres
 *    attributs (dont `id`) remplacent ceux du composant, comme dans pymdownx.blocks.
 * @param {Array<[string, any]>} list
 * @param {Object<string, string>} [extra]
 */
function attrs(list, extra) {
  const map = new Map(list.filter((a) => a[1] !== undefined && a[1] !== null && a[1] !== false));
  if (extra) {
    for (const k of Object.keys(extra)) {
      if (k === 'class') map.set('class', cls(map.get('class') || '', extra[k]));
      else map.set(k, extra[k]);
    }
  }
  let out = '';
  for (const [k, v] of map) out += v === true ? ' ' + k : ' ' + k + '="' + esc(v) + '"';
  return out;
}

/**
 * Encadré propre à l'aperçu (il n'existe pas sur le site) qui signale une erreur d'écriture.
 * @param {string} source   extrait du Markdown concerné, affiché tel quel
 * @param {string} message  explication en français
 * @param {'error'|'header'|'warning'|'site'} [level]
 *   error   : bloc invalide, affiché en texte brut sur le site ;
 *   header  : en-tête YAML illisible ;
 *   warning : écriture à corriger (bloc non fermé, valeur inconnue…) ;
 *   site    : écriture valide mais rendue différemment sur le site.
 * @param {number|null} [line]  ligne du fichier (à partir de 0) où se trouve le problème.
 *   Affichée dans l'encadré ; avec les attributs `code-line` et `data-line`, l'aperçu de VS Code
 *   sait aussi y ramener l'éditeur par un double-clic sur l'encadré.
 */
function errorBox(source, message, level, line) {
  const variant = level === 'site' ? 'warning' : (level === 'header' ? 'error' : (level || 'error'));
  const label = { warning: 'À corriger', site: 'Différent sur le site', header: 'En-tête de page illisible' }[level] || 'Composant mal écrit';
  const known = Number.isInteger(line) && line >= 0;
  return '<div class="dsfr-preview-error dsfr-preview-error--' + variant + (known ? ' code-line' : '') + '"' +
    (known ? ' data-line="' + line + '" title="Double-cliquer pour aller à la ligne ' + (line + 1) + ' dans l\'éditeur"' : '') + ' role="note">' +
    '<p class="dsfr-preview-error__label">' + label + (known ? ' <span class="dsfr-preview-error__line">· ligne ' + (line + 1) + '</span>' : '') + '</p>' +
    '<pre class="dsfr-preview-error__code">' + esc(source) + '</pre>' +
    '<p class="dsfr-preview-error__msg">' + esc(message) + '</p>' +
    (known ? '<p class="dsfr-preview-error__hint">Double-cliquez ici pour aller à la ligne ' + (line + 1) + ', puis cliquez sur l\'ampoule 💡 pour corriger</p>' : '') +
    '</div>\n';
}

module.exports = { esc, cls, attrs, errorBox };
