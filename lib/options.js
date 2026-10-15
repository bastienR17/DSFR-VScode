'use strict';
/**
 * Définition des blocs DSFR et lecture de leurs options.
 *
 * Ce module reproduit le comportement de `dsfr_structure` 0.12 (le paquet Python utilisé par
 * le thème MkDocs DSFR), lui-même construit sur `pymdownx.blocks` :
 *   - quels blocs existent, et s'ils acceptent un titre après « | » ;
 *   - quelles options chaque bloc accepte, avec leur valeur par défaut et leur type ;
 *   - comment ces options sont écrites (YAML indenté de 4 espaces sous l'en-tête du bloc).
 *
 * Toute option inconnue ou toute valeur invalide fait échouer le bloc, comme sur le site
 * (où le bloc s'affiche alors en texte brut). Le module est pur : aucune dépendance à
 * markdown-it ni à VS Code.
 */

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const MARKUPS = ['p'].concat(HEADINGS);
const VARIATIONS = ['', 'grey', 'no-border', 'no-background', 'shadow'];
const NOTICE_TYPES = ['info', 'warning', 'alert', 'weather-orange', 'weather-red', 'weather-purple', 'kidnapping', 'cyberattack', 'attack', 'witness'];

/* ------------------------------------------------------------------ */
/* Types d'options (même comportement que pymdownx.blocks)             */
/* ------------------------------------------------------------------ */

function tString(v) {
  if (typeof v === 'string') return v;
  throw new Error('un texte est attendu');
}

// Comme PyYAML, `true`, `yes`, `on`… sont des booléens, mais `'true'` entre guillemets est un texte.
function tBool(v) {
  if (typeof v === 'boolean') return v;
  throw new Error('attendu : true ou false (sans guillemets)');
}

// Valeur choisie dans une liste ; la comparaison ignore la casse, comme type_string_in.
function tIn(choices) {
  const fn = (v) => {
    const s = tString(v).toLowerCase();
    if (choices.includes(s)) return s;
    throw new Error('attendu : ' + choices.filter(Boolean).join(', '));
  };
  fn.choices = choices;
  return fn;
}

// Option générique `attrs` de pymdownx : dictionnaire d'attributs HTML ajoutés au bloc.
const IDENT_RE = /^[^\s"'>/=\0-\x1f]+$/;
function tAttrs(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('attendu : un dictionnaire, ex. {class: ma-classe, id: mon-id}');
  }
  const out = {};
  for (const k of Object.keys(v)) {
    if (!IDENT_RE.test(k)) throw new Error('nom d\'attribut invalide « ' + k + ' »');
    const lower = k.toLowerCase();
    out[lower === 'class' || lower === 'id' ? lower : k] = tString(v[k]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Mini parseur YAML                                                   */
/*                                                                     */
/* Les options d'un bloc sont du YAML très simple (« nom: valeur »,    */
/* éventuellement un dictionnaire en ligne ou sur un niveau). On ne    */
/* passe pas par js-yaml ici car il suit YAML 1.2 (`yes` y est un      */
/* texte) alors que le site utilise PyYAML, en YAML 1.1 (`yes` y est   */
/* un booléen) : ce parseur reproduit les règles de PyYAML.            */
/* ------------------------------------------------------------------ */

// Retire un commentaire « # … » qui n'est pas entre guillemets.
function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s;
}

// Découpe « a, {b: c}, [d, e] » sur les virgules de premier niveau.
function splitFlow(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of s) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '{' || c === '[') depth++;
    if (c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// « clé: valeur » → [clé, valeur brute], ou null si la ligne n'a pas cette forme.
function splitKey(line) {
  const m = /^("[^"]*"|'[^']*'|[^:]+?)[ \t]*:(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
  if (!m) return null;
  let key = m[1];
  if (/^["']/.test(key)) key = key.slice(1, -1);
  return [key, m[2] === undefined ? '' : m[2]];
}

function parseScalar(raw) {
  const s = stripComment(raw.trim());
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (s.length >= 2 && s[0] === '"' && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(["\\/nt])/g, (m, c) => ({ n: '\n', t: '\t' }[c] || c));
  }
  if (s.length >= 2 && s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s[0] === '{' && s.endsWith('}')) {
    const obj = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const kv = splitKey(part);
      if (!kv) throw new Error('YAML invalide : ' + part);
      obj[kv[0]] = parseScalar(kv[1]);
    }
    return obj;
  }
  if (s[0] === '[' && s.endsWith(']')) return splitFlow(s.slice(1, -1)).map(parseScalar);
  // Booléens et nombres selon YAML 1.1 (PyYAML)
  if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(s)) return true;
  if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(s)) return false;
  if (/^[-+]?(0|[1-9][0-9_]*)$/.test(s)) return Number(s.replace(/_/g, ''));
  if (/^[-+]?(\.[0-9]+|[0-9][0-9_]*\.[0-9_]*)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s.replace(/_/g, ''));
  return s;
}

/**
 * Lit les options d'un bloc (texte déjà désindenté).
 * Accepte « nom: valeur » et un dictionnaire imbriqué sur un niveau (utile pour `attrs`).
 * @throws {Error} avec un message en français si une ligne est illisible.
 */
function parseYamlLite(text) {
  const lines = text.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s/.test(line)) throw new Error('indentation inattendue : « ' + line.trim() + ' »');
    const kv = splitKey(line);
    if (!kv) throw new Error('ligne d\'option invalide : « ' + line.trim() + ' » (format attendu « nom: valeur »)');
    const [key, rest] = kv;
    if (stripComment(rest).trim() === '' && i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
      const sub = {};
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        const skv = splitKey(lines[i].trim());
        if (!skv) throw new Error('ligne d\'option invalide : « ' + lines[i].trim() + ' »');
        sub[skv[0]] = parseScalar(skv[1]);
        i++;
      }
      out[key] = sub;
      continue;
    }
    out[key] = parseScalar(rest);
    i++;
  }
  return out;
}

// Retire l'indentation commune à toutes les lignes non vides.
function dedent(lines) {
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    min = Math.min(min, /^[ \t]*/.exec(l)[0].length);
  }
  if (!isFinite(min)) min = 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/* ------------------------------------------------------------------ */
/* Blocs DSFR (miroir de dsfr_structure 0.12)                          */
/*                                                                     */
/* arg  : true = titre obligatoire, false = interdit, null = facultatif*/
/* mode : 'block'  = le contenu est du Markdown complet (paragraphes,  */
/*                   listes, blocs imbriqués…) ;                       */
/*        'inline' = le contenu est du texte en ligne (gras, liens…).  */
/* options : { nom: [valeur par défaut, type] }                        */
/* ------------------------------------------------------------------ */

const BLOCKS = {
  alert: {
    arg: null, mode: 'block',
    options: { type: ['info', tIn(['success', 'error', 'info', 'warning'])], markup: ['h5', tIn(MARKUPS)] },
  },
  accordion: {
    arg: true, mode: 'block',
    options: { open: [false, tBool], markup: ['h5', tIn(HEADINGS)] },
  },
  badge: {
    arg: false, mode: 'inline',
    options: { type: ['', tIn(['', 'success', 'error', 'info', 'warning', 'new'])], icon: [true, tBool], color: ['', tString] },
  },
  callout: {
    arg: null, mode: 'inline',
    options: {
      color: ['', tString], markup: ['p', tIn(MARKUPS)], icon: ['', tString],
      link_label: ['', tString], link_url: ['', tString], link_newtab: [false, tBool],
    },
  },
  card: {
    arg: null, mode: 'inline',
    options: {
      description: ['', tString], badge: ['', tString], tag: ['', tString], picto: ['', tString],
      markup: ['p', tIn(MARKUPS)], enlarge: [true, tBool], target: ['', tString], target_new: [false, tBool],
      image: ['', tString], image_alt: ['', tString], download: [false, tBool], lang: ['', tString],
      assess: [false, tBool], horizontal: [false, tBool], horizontal_pos: ['', tIn(['', 'tier', 'half'])],
      variations: ['', tIn(VARIATIONS)],
    },
  },
  tile: {
    arg: null, mode: 'inline',
    options: {
      description: ['', tString], badge: ['', tString], tag: ['', tString], picto: ['', tString],
      markup: ['p', tIn(MARKUPS)], enlarge: [true, tBool], target: ['', tString], target_new: [false, tBool],
      download: [false, tBool], lang: ['', tString], assess: [false, tBool], small: [false, tBool],
      horizontal: [false, tBool], vertical_breakpoint: ['', tIn(['', 'md', 'lg'])], variations: ['', tIn(VARIATIONS)],
    },
  },
  row: {
    arg: null, mode: 'block',
    options: { halign: ['', tIn(['', 'left', 'right', 'center'])], valign: ['', tIn(['', 'top', 'middle', 'bottom'])] },
  },
  col: { arg: null, mode: 'block', options: { class: ['', tString] } },
  // Déprécié par le thème au profit de la métadonnée « notice: » de l'en-tête (voir page-meta.js).
  notice: {
    arg: null, mode: 'inline',
    options: {
      type: ['info', tIn(NOTICE_TYPES)],
      markup: ['p', tIn(MARKUPS)], icon: ['', tString], link_label: ['', tString], link_url: ['', tString],
      link_title: ['', tString], link_newtab: [false, tBool],
    },
  },
  quote: {
    arg: null, mode: 'inline',
    options: { size: ['md', tIn(['md', 'lg', 'xl'])], image: ['', tString], color: ['', tString] },
  },
  media: {
    arg: null, mode: 'block',
    options: {
      type: ['video', tIn(['video', 'video_external', 'audio', 'image'])], url: ['', tString], captions: ['', tString],
      title: ['', tString], poster: ['', tString], link: ['', tString], link_label: ['', tString],
      ratio: ['16x9', tIn(['16x9', '4x3', '1x1', '32x9', '3x2', '3x4', '2x3'])],
    },
  },
  tabs: { arg: null, mode: 'block', options: { label: ["Système d'onglets", tString], viewport_width: [false, tBool] } },
  tab: { arg: true, mode: 'block', options: { selected: [false, tBool], icon: ['', tString] } },
  buttons: {
    arg: null, mode: 'block',
    options: {
      size: ['', tIn(['', 'sm', 'md', 'lg'])], inline: ['vertical', tIn(['vertical', 'inline', 'inline-sm', 'inline-md', 'inline-lg'])],
      equisized: [false, tBool], align: ['', tIn(['', 'left', 'center', 'right'])],
    },
  },
  button: {
    arg: true, mode: 'inline',
    options: {
      kind: ['', tIn(['', 'secondary', 'tertiary', 'tertiary-no-outline'])], size: ['', tIn(['', 'sm', 'md', 'lg'])],
      disabled: [false, tBool], icon: ['', tString], icon_place: ['left', tIn(['left', 'right', 'icon-only'])],
      target: ['', tString], target_new: [false, tBool],
    },
  },
};

/**
 * Vérifie le titre et les options d'un bloc et complète les valeurs par défaut.
 * @returns {{options: object}|{error: string}}
 */
function validate(name, arg, rawOptions) {
  const def = BLOCKS[name];
  if (def.arg === true && !arg) {
    return { error: 'Le bloc « ' + name + ' » doit avoir un titre : « /// ' + name + ' | Mon titre ».' };
  }
  if (def.arg === false && arg) {
    return { error: 'Le bloc « ' + name + ' » n\'accepte pas de titre après « | ».' };
  }
  const options = { attrs: {} };
  for (const k of Object.keys(def.options)) options[k] = def.options[k][0];
  for (const k of Object.keys(rawOptions)) {
    if (k === 'attrs') {
      try {
        options.attrs = tAttrs(rawOptions[k]);
      } catch (e) {
        return { error: 'Option « attrs » invalide : ' + e.message + '.' };
      }
      continue;
    }
    if (!def.options[k]) {
      return { error: 'Option inconnue « ' + k + ' » pour le bloc « ' + name + ' ». Options possibles : ' + Object.keys(def.options).concat('attrs').join(', ') + '.' };
    }
    try {
      options[k] = def.options[k][1](rawOptions[k]);
    } catch (e) {
      return { error: 'Valeur « ' + String(rawOptions[k]) + ' » invalide pour « ' + k + ' » (' + e.message + ').' };
    }
  }
  return { options };
}

module.exports = { BLOCKS, HEADINGS, MARKUPS, NOTICE_TYPES, parseYamlLite, dedent, validate };
